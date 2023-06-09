// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

import * as fs from 'fs/promises';
import * as core from '@actions/core';
import * as shlex from 'shlex';
import ciemu from './ciemu';
import { Docker } from './lib/docker';

(async function main () {

    if (process.platform !== 'linux') {
        throw new Error('CIEmu Action only works on Linux.');
    }

    const _ = void 0;

    const ciemuDirectory = __dirname.split('/').slice(0, -1).join('/');
    const runtimeDirectory = `${ciemuDirectory}/.ciemu/runtime`;

    // Get inputs

    let image = core.getInput('image') || 'alpine';
    let shell = core.getInput('shell') || '/bin/sh';
    let build: string | undefined = core.getInput('build') || _;
    let bind: string | undefined = core.getInput('bind') || _;
    let env: string | undefined = core.getInput('env') || _;
    let run: string | undefined = core.getInput('run') || _;
    let user: string | undefined = core.getInput('user') || `${process.getuid!()}:${process.getgid!()}`;
    let cachePrefix: string | undefined = core.getInput('cache-prefix') || _;

    // Configurations

    let workspace = process.env['GITHUB_WORKSPACE'] || process.cwd();
    let binds = bind ? shlex.split(bind) : _;
    let envs = env ? shlex.split(env).map(x => `${x}=${process.env[x] ?? ''}`) : _;

    cachePrefix = (cachePrefix ?? `ciemu-cache-${image}`).replace(/[^-_a-z0-9]+/gi, '-');

    let cacheDirectory = `${runtimeDirectory}/cache/${cachePrefix}`;
    fs.mkdir(cacheDirectory, { recursive: true });

    // Create docker client

    let docker = new Docker();

    // Run CIEmu

    const result = await ciemu(docker, {
        ciemuDirectory,
        runtimeDirectory,
        cacheDirectory,
        workspace,
        image,
        cachePrefix,
        shell,
        build,
        binds,
        envs,
        user,
        run,
    })

    // Set outputs

    core.setOutput('image', result.image);

})()
    .catch(err => {
        core.setFailed(err);
        throw err;
    });
