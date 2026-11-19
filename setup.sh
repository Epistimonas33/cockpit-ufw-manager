#!/bin/sh
set -e

REPO="Epistimonas33/cockpit-ufw-manager"
TARBALL="${TARBALL:-https://github.com/$REPO/archive/refs/heads/main.tar.gz}"
DEST="${DEST:-/usr/share/cockpit/ufw-manager}"

if [ "$(id -u)" -ne 0 ]; then
    echo "Please run as root, for example:"
    echo "  curl -fsSL https://raw.githubusercontent.com/$REPO/main/setup.sh | sudo sh"
    exit 1
fi

if [ "$1" = "uninstall" ]; then
    rm -rf "$DEST"
    echo "UFW Manager removed."
    exit 0
fi

for tool in curl tar; do
    command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool"; exit 1; }
done

[ -d /usr/share/cockpit ] || { echo "Cockpit is not installed (/usr/share/cockpit not found)."; exit 1; }

if command -v dpkg >/dev/null 2>&1 && dpkg -s cockpit-ufw-manager >/dev/null 2>&1; then
    echo "Removing the old .deb installation..."
    apt-get remove -y cockpit-ufw-manager </dev/null
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the latest version..."
curl -fsSL "$TARBALL" -o "$TMP/src.tar.gz"
mkdir "$TMP/src"
tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1

if [ ! -f "$TMP/src/ufw-manager/manifest.json" ] || [ ! -f "$TMP/src/version.txt" ]; then
    echo "Downloaded archive looks wrong, nothing was changed."
    exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$TMP/src/ufw-manager/." "$DEST/"
cp "$TMP/src/version.txt" "$DEST/version.txt"
chmod -R u=rwX,go=rX "$DEST"

echo "UFW Manager v$(cat "$DEST/version.txt") installed."
echo "Reload Cockpit in your browser (Ctrl+Shift+R)."
