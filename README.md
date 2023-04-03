# CIEmu Action

[![Getting started with CIEmu Action](https://github.com/ciemu/action/actions/workflows/getting-started.yml/badge.svg)](https://github.com/ciemu/action/actions/workflows/getting-started.yml)

The CIEmu Action (CIEmu: *see-I-am-you*) enables seamless and efficient multi-arch emulation for Linux containers on GitHub Actions workflows. With CIEmu, you can easily run Linux containers with a specific CPU architecture, regardless of the underlying host architecture.

## Getting started

This guide will walk you through the basic steps of using the CIEmu Action, including setting up your workflow, configuring the action inputs, and running your first container.

### Configure the action inputs

The CIEmu Action has several inputs that you can configure to customize the behavior of the action. Here's a brief description of each input:

| Input | Description |
| --- | --- |
| **General** |
| `image` | The image base to be used for emulation. <br> Default: `alpine` |
| `token` | The GitHub token to authenticate with the GitHub Container Registry. <br> Default: *not set* |
| `cache-prefix` | The prefix of the cache to be used to store the built image. If not specified, the image name will be used. <br> Default: *Computed from the `image` name.* E.g.: `ciemu-cache-alpine-3-17` *or* `ciemu-cache-ubuntu-jammy`. |
| `shell` | The shell to execute the `build` and `run` commands. <br> Default: `/bin/sh` |	
| **Build image** |
| `build` | The commands to be executed to build the image for this container. <br> Default: *not set* |
| **Run container** |
| `bind` | A space-separated list of volume bindings for this container. <br> Default: *Mounts `/var/run/docker.sock`, CIEmu Action directory and workspace directory.* |
| `env` | A space-separated list of environment variables names to be exported for this container. <br> Default: *not set* |
| `run` | The commands to be executed to run the container. <br> Default: *not set* |

### Set up your workflow

To use the CIEmu Action in your workflow, you'll need to create a new workflow file or edit an existing one in your repository. Here's an example of a workflow file that uses the CIEmu Action to build and run a container on a variety of Linux distributions and architectures:

```yaml
name: Getting started with CIEmu Action

on: [ push, pull_request ]

permissions:
  packages: write

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
      - name: Executing CIEmu
        uses: ciemu/action@v0
        env: 
          CIEMU_IMAGE: ${{ matrix.image }}
        with:
          # Image base
          image: ${{ matrix.image }}
          # Caching
          token: ${{ secrets.GITHUB_TOKEN }}
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
            wget -O /usr/local/bin/chipsay https://raw.githubusercontent.com/ciemu/action/v0/chipsay
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

The workflow will build the image for each container using the `build` input, and then run the container using the `run` input. The `build` commands will install the `chipsay` utility, which will be used to print a message with the container's architecture and distribution. Then, the `run` commands will execute the `chipsay` utility.

The CIEmu Action includes a cache feature that can help speed up your builds by reusing previously built Docker images. The cache works by storing the Docker image in a the GitHub Container Registry. To use the cache, you'll need to set the `token` input to the `secrets.GITHUB_TOKEN` environment variable, and (optionally) set the `cache-prefix` input to a key of your choice.

# License

Copyright (c) Rodrigo Speller. All rights reserved.

This software is distributed under the terms of the MIT license
(see [LICENSE](LICENSE)).