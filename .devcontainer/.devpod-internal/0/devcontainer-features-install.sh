#!/bin/sh
set -e

on_exit () {
	[ $? -eq 0 ] && exit
	echo 'ERROR: Feature "Git (from source)" (ghcr.io/devcontainers/features/git) failed to install! Look at the documentation at ${documentation} for help troubleshooting this error.'
}

trap on_exit EXIT

set -a
. ../devcontainer-features.builtin.env
. ./devcontainer-features.env
set +a

echo ===========================================================================

echo 'Feature       : Git (from source)'
echo 'Description   : Install an up-to-date version of Git, built from source as needed. Useful for when you want the latest and greatest features. Auto-detects latest stable version and installs needed dependencies.'
echo 'Id            : ghcr.io/devcontainers/features/git'
echo 'Version       : 1.3.5'
echo 'Documentation : https://github.com/devcontainers/features/tree/main/src/git'
echo 'Options       :'
echo '    PPA="true"
    VERSION="os-provided"'
echo 'Environment   :'
printenv
echo ===========================================================================

chmod +x ./install.sh
./install.sh
