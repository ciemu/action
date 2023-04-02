// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

import * as core from '@actions/core';
import { Docker } from "./lib/docker";
import { createTar } from './lib/tar';

export type CIEmuOptions = {
    ciemuDirectory: string;
    workspace: string;
    image: string;
    shell: string;
    buildCacheImage?: string,
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
 * If a token is provided, the image will be pushed to the registry to be used as cache.
 * @returns The image ID.
 */
async function buildImage(docker: Docker, { image, shell, build, buildCacheImage }: CIEmuOptions) {

    if (!build)
        throw new Error('No command to build.');

    // Pull cached image

    if (buildCacheImage) {
        core.info('Pulling cached image from registry...');

        try {
            const pullResult = await docker.createImage({
                options: {
                    fromImage: buildCacheImage,
                },
            });
    
            await docker.followProgress(pullResult);
        } catch (e) {
            core.warning(`Failed to pull cached image: ${e?.toString()}`);
        }
        
    } else {
        core.warning('No image build cache name provided, skipping pull cache from registry.');
    }

    // Create build context

    core.info('Creating build context...');
    var encoder = new TextEncoder();
    const dockerfile = [
        `FROM ${image}`,
        'COPY ciemu-build.sh /ciemu-build.sh',
        `RUN ${shell} /ciemu-build.sh`,
        'RUN rm /ciemu-build.sh'
    ].join('\n')

    var context = createTar([
        { name: 'Dockerfile', data: encoder.encode(dockerfile) },
        { name: 'ciemu-build.sh', data: encoder.encode(build!) }
    ]);

    // Build image

    core.info('Building image...');
    const buildResult = await docker.build(
        {
            context: Buffer.from(context),
            options: {
                cachefrom: buildCacheImage ? [ buildCacheImage ] : void 0,
                q: true
            },
        },
        true
    );

    // Push image to cache

    if (buildCacheImage) {
        core.info('Pushing image to registry..');

        await buildResult.tag({ repo: buildCacheImage });

        let pushResult = await docker.pushImage({
            name: buildCacheImage
        })
        
        await docker.followProgress(pushResult);
    } else {
        core.info('No image build cache name provided, skipping push cache to registry.');
    }

    return buildResult.id;
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