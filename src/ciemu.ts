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
    runtimeDirectory: string;
    cacheDirectory: string;
    cachePrefix: string;
    workspace: string;
    image: string;
    shell: string;
    build?: string;
    binds?: string[];
    envs?: string[];
    user?: string;
    run?: string;
}

export default async function main(docker: Docker, options: CIEmuOptions) {

    const { image, build, run } = options;

    let imageToRun = image;

    // Register multi-arch emulation
    await core.group(
        'Enabling execution of multi-arch binaries (powered by QEMU)',
        async () => await registerEmulation(docker, options)
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

    return {
        image: imageToRun
    };
}

/**
 * Register multi-arch emulation binaries.
 */
async function registerEmulation(docker: Docker, { runtimeDirectory }: CIEmuOptions) {

    const lock = await fs.stat(`${runtimeDirectory}/ciemu.lock`)
        .then(() => true)
        .catch(() => false);

    if (lock) {
        core.info('Emulation binaries already registered.');
        return;
    }

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

    // Create lock file
    await fs.writeFile(`${runtimeDirectory}/ciemu.lock`, '');
}

/**
 * Build a new image from from the given image and build script.
 * @returns The name of the built image.
 */
async function buildImage(docker: Docker, options: CIEmuOptions) {

    const { cacheDirectory, cachePrefix, image, shell, build } = options;

    const buildCommand = build || '';

    // Create build context

    core.info('Creating build context...');
    const encoder = new TextEncoder();
    const dockerfile = [
        `FROM ${image}`,
        `ARG CIEMU_BUILD_SCRIPT=false`,
        `RUN ${shell} -c "$CIEMU_BUILD_SCRIPT"`,
    ].join('\n')

    const context = createTar([
        { name: 'Dockerfile', data: encoder.encode(dockerfile) }
    ]);

    const contextHash = crypto
        .createHash('sha1')
        .update("ciemu-cache-1") // increment to invalidate cache (e.g. when the cache format changes)
        .update(cachePrefix)
        .update(dockerfile)
        .update(buildCommand)
        .digest('hex');

    // Import image from cache

    core.info('Loading image cache...');

    const builtImage = `${cachePrefix}-${contextHash}`;
    core.info(`Unique cache key: ${builtImage}`);

    const cacheResult = await cache.restoreCache([ cacheDirectory ], builtImage);
    if (cacheResult) {
        core.info('Importing image from cache...');
        const file = await fs.open(`${cacheDirectory}/image.tar`);
        const importResult = await docker.importImages({ stream: file.createReadStream() });
        await docker.followProgress(importResult);
        await file.close();

        return builtImage;
    } else {
        core.info('Cache miss.');
    }

    // Build image

    core.info('Building image...');
    const buildResult = await docker.build(
        {
            context: Buffer.from(context),
            stdout: process.stdout,
            options: {
                buildargs: {
                    CIEMU_BUILD_SCRIPT: buildCommand
                }
            },
        },
        true
    );

    // Export image to cache

    if (!cacheResult) {
        core.info('Caching image..');

        await buildResult.tag({ repo: builtImage });

        const exportResult = await docker.exportImage({ name: builtImage });
        await fs.writeFile(`${cacheDirectory}/image.tar`, exportResult);
        await cache.saveCache([ cacheDirectory ], builtImage);
    }

    return builtImage;
}

/**
 * Run a command inside a container.
 */
async function runCommand(docker: Docker, image: string, options: CIEmuOptions) {

    const { ciemuDirectory, shell, run, binds, envs, user, workspace } = options;

    const runCommand = run || '';

    core.info('Running container...');
    const result = await docker.run({
        create: {
            Image: image,
            Cmd: [shell, '-c', runCommand],
            WorkingDir: workspace,
            Env: envs,
            User: user,
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
