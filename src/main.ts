// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as shlex from 'shlex';
import ciemu from './ciemu';
import { Docker, RegExpPatternAuthenticationHandler } from './lib/docker';

(async function main () {

    const _ = void 0;

    let ciemuDirectory = __dirname.split('/').slice(0, -1).join('/');

    // Get inputs

    let image = core.getInput('image') || 'alpine';
    let shell = core.getInput('shell') || '/bin/sh';
    let build: string | undefined = core.getInput('build') || _;
    let bind: string | undefined = core.getInput('bind') || _;
    let env: string | undefined = core.getInput('env') || _;
    let run: string | undefined = core.getInput('run') || _;
    let token: string | undefined = core.getInput('token') || _;
    let cacheName: string | undefined = core.getInput('cache-name') || _;

    // Configurations

    let workspace = process.env['GITHUB_WORKSPACE'] || process.cwd();
    let repository = process.env['GITHUB_REPOSITORY'] || 'unknown';
    let binds = bind ? shlex.split(bind) : _;
    let envs = env ? shlex.split(env).map(x => `${x}=${process.env[x] ?? ''}`) : _;

    cacheName = (cacheName ?? `ciemu-cache-{image}`).replace(/[^-_a-z0-9]+/gi, '-');
    let buildCacheImage = `ghcr.io/${repository}/${cacheName}`.toLowerCase();

    if (!build && !run) {
        core.warning("Both 'build' and 'run' are empty, nothing to do.");
    }

    // Create docker client

    let docker = new Docker({
        auth: token
            ? new RegExpPatternAuthenticationHandler(
                /^ghcr.io\//,
                {
                    username: github.context.actor,
                    password: token,
                })
            : _,
    });

    // Run CIEmu

    await ciemu(docker, {
        ciemuDirectory,
        workspace,
        image,
        shell,
        build,
        buildCacheImage,
        binds,
        envs,
        run,
    })

})()
    .catch(err => {
        core.setFailed(err);
    });
