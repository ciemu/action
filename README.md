# CIEmu Action

[![Getting started with CIEmu Action](https://github.com/ciemu/action/actions/workflows/getting-started.yml/badge.svg)](https://github.com/ciemu/action/actions/workflows/getting-started.yml)

The CIEmu Action (CIEmu: *see-I-am-you*) enables seamless and efficient multi-arch emulation for Linux containers on GitHub Actions workflows. With CIEmu, you can easily run Linux containers with a specific CPU architecture, regardless of the underlying host architecture.

## Getting started

This guide will walk you through the basic steps of using the CIEmu Action, including setting up your workflow, configuring the action inputs, and running your first container.

### Configure the action inputs

The CIEmu Action has several inputs that you can configure to customize the behavior of the action. Here's a brief description of each input:

#### General inputs

- `image` - The image base to be used for emulation. Default: `alpine`.
- `cache-prefix` - The prefix of the cache to be used to store the built image. If not specified, the image name will be used. Default: *Computed from the `image` name.* E.g.: `ciemu-cache-alpine-3-17` *or* `ciemu-cache-ubuntu-jammy`.
- `shell` - The shell to execute the `build` and `run` commands. Default: `/bin/sh`.

#### Build image inputs

- `build` - The commands to be executed to build the image for this container. Default: *not set*.

#### Run container inputs

- `bind` - A space-separated list of volume bindings for this container. Default: *Mounts `/var/run/docker.sock`, CIEmu Action directory and workspace directory.*
- `env` - A space-separated list of environment variables names to be exported for this container. Default: *not set*.
- `user` - The user to be used within the running container. Default: *The current user and group that is executing the workflow. Note that the mapped user and group of the /etc/passwd file inside the container may not match the current user and group.*
- `run` - The commands to be executed to run the container. Default: *not set*.

### Set up your workflow

To use the CIEmu Action in your workflow, you'll need to create a new workflow file or edit an existing one in your repository. Here's an example of a workflow file that uses the CIEmu Action to build and run a container on a variety of Linux distributions and architectures:

```yaml
name: Getting started with CIEmu Action

on: [ push, pull_request ]

jobs:
  getting-started:
    name: Running on ${{ matrix.image }}
    runs-on: ubuntu-22.04

    strategy:
      matrix:
        include:
          # Alpine 3.17 images
          - image: amd64/alpine:3.17
          - image: arm32v6/alpine:3.17
          - image: arm32v7/alpine:3.17
          - image: arm64v8/alpine:3.17
          - image: ppc64le/alpine:3.17
          - image: s390x/alpine:3.17
          # Alpine Edge image
          - image: riscv64/alpine:edge
          # Ubuntu Jammy images
          - image: amd64/ubuntu:jammy
          - image: arm32v7/ubuntu:jammy
          - image: arm64v8/ubuntu:jammy
          - image: ppc64le/ubuntu:jammy
          - image: s390x/ubuntu:jammy
          # Ubuntu Bionic image
          - image: i386/ubuntu:bionic
          
    steps:
      - name: Run CIEmu Action - Getting started
        uses: ciemu/action@v0
        env: 
          CIEMU_IMAGE: ${{ matrix.image }}
        with:
          # Image base
          image: ${{ matrix.image }}
          # Caching
          cache-prefix: cache-getting-started-${{ matrix.image }}
          # Build image
          build: |
            set -e

            # Install dependencies

            case '${{ matrix.image }}' in
              *alpine*)
                apk add --no-cache wget
                ;;
              *ubuntu*)
                apt-get update -y
                apt-get install -y wget
                ;;
            esac

            # Install chipsay

            wget -O /usr/local/bin/chipsay https://raw.githubusercontent.com/ciemu/chipsay/main/chipsay
            chmod 755 /usr/local/bin/chipsay
          # Run container
          bind: |
            /home:/mnt/custom1:ro
            /home:/mnt/custom2:ro
          env: |
            CIEMU_IMAGE
          run: |
            chipsay
```

This workflow will runs on every push and pull request to the repository. It will execute the CIEmu Action on a variety of Linux distributions and architectures, including `amd64`, `arm32v6`, `arm32v7`, `arm64v8`, `i386`, `ppc64le`, `riscv64` and `s390x`.

The workflow will build the image for each container using the `build` input, and then run the container using the `run` input. The `build` commands will install the [`chipsay`](https://github.com/ciemu/chipsay) utility, which will be used to print a message with the container's architecture and distribution. Then, the `run` commands will execute the `chipsay` utility.

The CIEmu Action includes a cache feature that can help speed up your builds by reusing previously built Docker images. The cache works by storing the Docker image in the GitHub Actions Cache.

#### Register-emulators-only mode

The CIEmu Action can also be used to register the emulators without building the image or running the container. This mode can be useful if you want to use the emulators in a subsequent step of your workflow. To use this mode, use the CIEmu Action without any inputs:

```yaml
name: Getting started with CIEmu Action - Register emulators only

on: [ push, pull_request ]

jobs:
  register-emulators-only:
    name: Registering emulators to run chipsay
    runs-on: ubuntu-22.04

    steps:
      - name: Run CIEmu Action - Register emulators only
        uses: ciemu/action@v0

      - name: Run chipsay sample container
        run: |
          docker run ghcr.io/ciemu/chipsay:amd64
          docker run ghcr.io/ciemu/chipsay:arm32v6
          docker run ghcr.io/ciemu/chipsay:arm32v7
          docker run ghcr.io/ciemu/chipsay:arm64v8
          docker run ghcr.io/ciemu/chipsay:ppc64le
          docker run ghcr.io/ciemu/chipsay:riscv64
          docker run ghcr.io/ciemu/chipsay:s390x
```

In this example, the CIEmu Action will register the emulators to run the `chipsay` utility on many architectures. This is a simple example.

Although you can use this mode to register the emulators to run any application on practically any architecture. The usage of containers is a great approach to run applications on different architectures, because they are lightweight and portable, and you can use it to isolate the application environment from the host environment.

#### Build-only mode

The CIEmu Action can also be used to build a Docker image to use in a subsequent step of your workflow.

```yaml
name: Getting started with CIEmu Action - Build only

on: [ push, pull_request ]

jobs:
  build-only:
    name: Building chipsay image
    runs-on: ubuntu-22.04

    strategy:
      matrix:
        include:
          - image: amd64/alpine:3.17
          - image: arm32v6/alpine:3.17
          - image: arm32v7/alpine:3.17
          - image: arm64v8/alpine:3.17
          - image: ppc64le/alpine:3.17
          - image: s390x/alpine:3.17
          - image: riscv64/alpine:edge
          
    steps:
      - name: Run CIEmu Action - Build only
        uses: ciemu/action@v0
        id: ciemu
        with:
          # Image base
          image: ${{ matrix.image }}
          # Caching
          cache-prefix: cache-getting-started-${{ matrix.image }}
          # Build image
          build: |
            set -e

            # Install dependencies
            apk add --no-cache wget

            # Install chipsay
            wget -O /usr/local/bin/chipsay https://raw.githubusercontent.com/ciemu/chipsay/main/chipsay
            chmod 755 /usr/local/bin/chipsay

      - name: Run chipsay sample container
        run: docker run "${{ steps.ciemu.outputs.image }}"
```

#### Run-only mode

The CIEmu Action can also be used to run commands on a Docker container based on a previously built image.

```yaml
name: Getting started with CIEmu Action - Run only

on: [ push, pull_request ]

jobs:
  run-only:
    name: Running chipsay image
    runs-on: ubuntu-22.04

    strategy:
      matrix:
        include:
          - image: ghcr.io/ciemu/chipsay:amd64
          - image: ghcr.io/ciemu/chipsay:arm32v6
          - image: ghcr.io/ciemu/chipsay:arm32v7
          - image: ghcr.io/ciemu/chipsay:arm64v8
          - image: ghcr.io/ciemu/chipsay:ppc64le
          - image: ghcr.io/ciemu/chipsay:riscv64
          - image: ghcr.io/ciemu/chipsay:s390x

    steps:
      - name: Run CIEmu Action - Run only
        uses: ciemu/action@v0
        env: 
          CIEMU_IMAGE: ${{ matrix.image }}
        with:
          # Image base
          image: ${{ matrix.image }}
          # Run container
          bind: |
            /home:/mnt/custom1:ro
            /home:/mnt/custom2:ro
          env: |
            CIEMU_IMAGE
          run: |
            chipsay
```

This workflow will run `chipsay` utility on a variety of Linux distributions and architectures.

# License

Copyright (c) Rodrigo Speller. All rights reserved.

This software is distributed under the terms of the MIT license
(see [LICENSE](LICENSE)).
