// Copyright (c) Rodrigo Speller. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { Stream } from 'stream';
import { Writable } from 'stream';
import Modem, { HttpDuplex } from 'docker-modem'

export class Docker {
    public readonly modem: Modem;

    constructor(private readonly options?: DockerOptions) {
        this.modem = new Modem(options?.modem);
    }

    dial(options: Modem.DialOptions) {
        return new Promise<IncomingMessage | HttpDuplex | Socket | Buffer | object | null>((resolve, reject) => {
            this.modem.dial(options, (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result);
            });
        });
    }

    followProgress(socket: Stream, onProgress?: (event: any) => void) {
        return new Promise((resolve, reject) => {
            this.modem.followProgress(socket, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(res);
            }, onProgress);
        });
    }

    async createContainer(options: CreateContainerOptions) {
        const request = {
            path: '/containers/create?',
            method: 'POST',
            options,
            statusCodes: {
                200: true,
                201: true,
                400: 'bad parameter',
                404: 'no such image',
                409: 'conflict',
                500: 'server error',
            }
        }

        const result = await this.dial(request) as CreateContainerResult;
        return new DockerContainer(this, result.Id);
    }

    async build(options: BuildOptions) : Promise<IncomingMessage>;
    async build(options: BuildOptions, processProgress: true) : Promise<DockerImage>;
    async build({ context, options, stdout }: BuildOptions, processProgress: boolean = true) : Promise<IncomingMessage | DockerImage> {
        const request = {
            path: '/build?',
            method: 'POST',
            isStream: true,
            file: context,
            options,
            statusCodes: {
                200: true,
                400: 'bad parameter',
                500: 'server error',
            },
        };

        let response = await this.dial(request) as IncomingMessage;

        if (!processProgress) {
            return response;
        }

        let result: any = {}, error: any;

        await this.followProgress(response, (event) => {
            if (event.error)
                error = event.error;
            else if (event.aux)
                Object.assign(result, event.aux);
            else if (event.stream) {
                if (stdout) {
                    stdout.write(event.stream);
                }
            } else if (options.q && 'string' == typeof event.stream && event.stream.startsWith('sha256:'))
                Object.assign(result, { ID: event.stream.trim() });
        });

        if (error) {
            throw error;
        }

        return new DockerImage(this, result.ID);
    }

    async createImage({ options, authconfig }: CreateImageOptions) {
        const request: Modem.DialOptions = {
            path: '/images/create?',
            method: 'POST',
            isStream: true,
            options: options,
            statusCodes: {
                200: true,
                404: 'repository does not exist or no read access',
                500: 'server error',
            },
            authconfig: authconfig ?? await this.options?.auth?.authenticate(options.fromImage)
        };

        return await this.dial(request) as IncomingMessage;
    }

    async exportImage({ name }: ExportImageOptions) {
        const request: Modem.DialOptions = {
            path: `/images/${name}/get?`,
            method: 'GET',
            isStream: true,
            statusCodes: {
                200: true,
                500: 'server error',
            }
        };

        return await this.dial(request) as IncomingMessage;
    }

    async importImages({ stream }: ImportImagesOptions) {
        const request: Modem.DialOptions = {
            path: '/images/load?',
            method: 'POST',
            isStream: true,
            file: stream,
            statusCodes: {
                200: true,
                404: 'repository does not exist or no read access',
                500: 'server error',
            }
        };

        return await this.dial(request) as IncomingMessage;
    }

    async pushImage({ name, options, authconfig }: PushImageOptions) {
        
        const request: Modem.DialOptions = {
            path: `/images/${name}/push`,
            method: 'POST',
            isStream: true,
            options,
            statusCodes: {
                200: true,
                404: 'no such image',
                500: 'server error',
            },
            authconfig: authconfig ?? await this.options?.auth?.authenticate(name)
        };

        return await this.dial(request) as IncomingMessage;
    }

    async run(options: RunOptions): Promise<RunResult> {
        let container = await this.createContainer(options.create);

        let stream = await container.attach({
            stream: true,
            stdout: true,
            stderr: true
        });

        this.modem.demuxStream(
            stream,
            options.stdout ?? process.stdout,
            options.stderr ?? process.stderr
        );

        await container.start({});

        const result = await container.wait({});
        return {
            container: container,
            statusCode: result.StatusCode,
        };
    }

}

export class DockerContainer {
    constructor(
        private readonly docker: Docker,
        private readonly id: string,
    ) {}

    async attach(options: ContainerAttachOptions) {
        const request = {
            path: `/containers/${this.id}/attach?`,
            method: 'POST',
            isStream: true,
            options,
            statusCodes: {
                200: true,
                400: 'bad parameter',
                404: 'no such container',
                500: 'server error',
            },
        };

        return await this.docker.dial(request) as IncomingMessage;
    }
    
    async commit(options: ContainerCommitOptions) {
        const request = {
            path: `/commit?`,
            method: 'POST',
            options: Object.assign({}, options, { container: this.id }),
            statusCodes: {
                200: true,
                201: true,
                404: 'no such container',
                500: 'server error',
            },
        };

        return await this.docker.dial(request) as ContainerCommitResult;
    }

    async start({}: ContainerStartOptions): Promise<ContainerStartResult> {
        const request = {
            path: `/containers/${this.id}/start?`,
            method: 'POST',
            options: {},
            statusCodes: {
                204: true,
                304: 'container already started',
                404: 'no such container',
                500: 'server error',
            },
        };

        await this.docker.dial(request);
    }

    async wait(options: ContainerWaitOptions) {
        const request = {
            path: `/containers/${this.id}/wait?`,
            method: 'POST',
            options: options,
            statusCodes: {
                200: true,
                400: 'bad parameter',
                404: 'no such container',
                500: 'server error',
            },
        };

        return await this.docker.dial(request) as ContainerWaitResult;
    }
}

export class DockerImage {
    constructor(
        public readonly docker: Docker,
        public readonly id: string,
    ) {}

    async tag(options: ImageTagOptions) {
        const request: Modem.DialOptions = {
            path: `/images/${this.id}/tag?`,
            method: 'POST',
            options: options,
            statusCodes: {
                200: true,
                201: true,
                400: 'bad parameter',
                404: 'no such image',
                409: 'conflict',
                500: 'server error',
            }
        };

        await this.docker.dial(request);
    }
}

export abstract class AuthenticationHandler {
    public abstract authenticate(name: string): Promise<AuthConfig | undefined>;
}

export class RegExpPatternAuthenticationHandler extends AuthenticationHandler {
    constructor(
        private readonly pattern: RegExp,
        private readonly authconfig: AuthConfig,
    ) {
        super();
    }

    override async authenticate(name: string) {
        if (this.pattern.test(name)) {
            return this.authconfig;
        }
    }
}

export type DockerOptions = {
    auth?: AuthenticationHandler,
    modem?: Modem.ConstructorOptions
}

export type AuthConfig = {
    username: string,
    password: string,
}

export type BuildOptions = {
    context: Buffer,
    stdout?: Writable,
    options: {
        buildargs?: Record<string, string>,
        cachefrom?: string[],
        q?: boolean,
    }
}
export type BuildResult = {
    ID: string,
}

export type CreateImageOptions = {
    authconfig?: AuthConfig,
    options: {
        fromImage: string,
        tag?: string,
    }
}

export type ExportImageOptions = {
    name: string,
}

export type ImportImagesOptions = {
    stream: NodeJS.ReadableStream
}

export type PushImageOptions = {
    authconfig?: AuthConfig,
    name: string,
    options?: {
        tag?: string,
    },
}

export type CreateContainerOptions = {
    AttachStderr?: boolean,
    AttachStdin?: boolean,
    AttachStdout?: boolean,
    Cmd?: string[],
    Env?: string[],
    HostConfig?: CreateContainerHostConfigOptions,
    Image: string,
    OpenStdin?: boolean,
    StdinOnce?: boolean,
    Tty?: boolean,
    User?: string,
    Volumes?: Record<string, {}>,
    WorkingDir?: string,
}
export type CreateContainerHostConfigOptions = {
    AutoRemove?: boolean,
    Binds?: string[],
    Privileged?: boolean,
}

export type CreateContainerResult = { Id: string }

export type RunOptions = {
    create: CreateContainerOptions
    stderr?: Writable,
    stdout?: Writable,
}
export type RunResult = {
    container: DockerContainer,
    statusCode: number,
}

export type ContainerAttachOptions = {
    stream?: boolean,
    stdout?: boolean,
    stderr?: boolean,
}

export type ContainerCommitOptions = {}
export type ContainerCommitResult = { Id: string }

export type ContainerStartOptions = {}
export type ContainerStartResult = void

export type ContainerWaitOptions = {}
export type ContainerWaitResult = { StatusCode: number }

export type ImageTagOptions = {
    repo?: string,
    tag?: string,
}
