# UFW Manager for Cockpit

A small [Cockpit](https://cockpit-project.org/) plugin for managing the UFW firewall from the browser.

- Add rules with an optional source IP or subnet
- Delete rules one by one or in bulk, with a confirmation dialog
- Change the default incoming/outgoing policies
- Filter rules and group IPv4/IPv6 duplicates
- See which process listens on each port

## Install

Run this on the server (needs Cockpit and `curl`):

```sh
curl -fsSL https://raw.githubusercontent.com/Epistimonas33/cockpit-ufw-manager/main/setup.sh | sudo sh
```

Then open Cockpit and press `Ctrl+Shift+R`.

## Update

When a new version is released, a banner appears in the plugin. Click **Update now**.
You can also just run the install command above again.

## Uninstall

```sh
curl -fsSL https://raw.githubusercontent.com/Epistimonas33/cockpit-ufw-manager/main/setup.sh | sudo sh -s uninstall
```

## Found a bug?

Use the **Report a bug** link at the bottom of the plugin, or open an issue on GitHub.

## License

See [LICENSE](LICENSE).
