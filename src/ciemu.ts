// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { Docker } from "./lib/docker";
import { createTar } from './lib/tar';

export type CIEmuOptions = {
    ciemuDirectory: string;
    cacheDirectory: string;
    cachePrefix: string;
    workspace: string;
    image: string;
    shell: string;
    build?: string;
    binds?: string[];
    envs?: string[];
    run?: string;
}

export default async function main(docker: Docker, options: CIEmuOptions) {

    let { image, build, run } = options;
    let imageToRun = image;

    // Register multi-arch emulation
    await core.group(
        'Enabling execution of multi-arch binaries (powered by QEMU)',
        async () => await registerEmulation(docker)
    );

    // Build user image
    if (build) {
        imageToRun = await core.group(
            'Building image',
            async () => await buildImage(docker, options)
        );
    }

    // Run user command
    if (run) {
        await core.group(
            'Running command',
            async () => await runCommand(docker, imageToRun, options)
        );
    }
}

/**
 * Register multi-arch emulation binaries.
 */
async function registerEmulation(docker: Docker) {

    // Pull multiarch/qemu-user-static:latest
    core.info('Pulling multiarch/qemu-user-static:latest...');
    const pullResult = await docker.createImage({
        options: {
            fromImage: 'multiarch/qemu-user-static',
            tag: 'latest'
        }
    });

    // Wait for pull to finish
    await docker.followProgress(pullResult);

    // Run multiarch/qemu-user-static
    core.info('Registering emulation binaries...');
    await docker.run({
        create: {
            Image: 'multiarch/qemu-user-static',
            Cmd: ['--reset', '--credential', 'yes', '--persistent', 'yes'],
            HostConfig: {
                AutoRemove: true,
                Privileged: true,
            }
        }
    })

}

/**
 * Build a new image from from the given image and build script.
 * @returns The image ID.
 */
async function buildImage(docker: Docker, { cacheDirectory, cachePrefix, image, shell, build }: CIEmuOptions) {

    if (!build)
        throw new Error('No command to build.');

    // Create build context

    core.info('Creating build context...');
    let encoder = new TextEncoder();
    let dockerfile = [
        `FROM ${image}`,
        'COPY ciemu-build.sh /ciemu-build.sh',
        `RUN ${shell} /ciemu-build.sh`,
        'RUN rm /ciemu-build.sh'
    ].join('\n')

    let context = createTar([
        { name: 'Dockerfile', data: encoder.encode(dockerfile) },
        { name: 'ciemu-build.sh', data: encoder.encode(build!) }
    ]);

    const contextHash = crypto
        .createHash('sha1')
        .update("ciemu-cache-v0") // use to invalidate cache (e.g. when the cache format changes)
        .update(cachePrefix)
        .update(dockerfile)
        .update(build!)
        .digest('hex');

    // Import image from cache

    core.info('Loading image cache...');

    const uniqueCacheKey = `${cachePrefix}-${contextHash}`;
    core.info(`Unique cache key: ${uniqueCacheKey}`);

    const cacheResult = await cache.restoreCache([ cacheDirectory ], uniqueCacheKey);
    if (cacheResult) {
        core.info('Importing image form cache...');
        const file = await fs.open(`${cacheDirectory}/image.tar`);
        const importResult = await docker.importImages({ stream: file.createReadStream() });
        await docker.followProgress(importResult);
        await file.close();

        return uniqueCacheKey;
    } else {
        core.info('Cache miss.');
    }

    // Build image

    core.info('Building image...');
    const buildResult = await docker.build(
        {
            context: Buffer.from(context),
            options: { q: true },
        },
        true
    );

    // Export image to cache

    if (!cacheResult) {
        core.info('Caching image..');

        await buildResult.tag({ repo: uniqueCacheKey });

        const exportResult = await docker.exportImage({ name: uniqueCacheKey });
        await fs.writeFile(`${cacheDirectory}/image.tar`, exportResult);
        await cache.saveCache([ cacheDirectory ], uniqueCacheKey);
    }

    return uniqueCacheKey;
}

/**
 * Run a command inside a container.
 */
async function runCommand(docker: Docker, image: string, { ciemuDirectory, shell, run, binds, envs, workspace }: CIEmuOptions) {

    if (!run)
        throw new Error('No command to run.');

    core.info('Running container...');
    const result = await docker.run({
        create: {
            Image: image,
            Cmd: [shell, '-c', run],
            WorkingDir: workspace,
            Env: envs,
            HostConfig: {
                Binds: [
                    "/var/run/docker.sock:/var/run/docker.sock:ro",
                    `${ciemuDirectory}:${ciemuDirectory}:ro`,
                    `${workspace}:${workspace}`,
                    ...(binds || [])
                ],
            }
        }
    });

    core.setOutput('exit-code', result.statusCode);
    core.info(`Exit code: ${result.statusCode}.`);

}
