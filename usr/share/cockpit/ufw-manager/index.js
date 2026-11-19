const CURRENT_VERSION = "1.0.0";
const CHECK_URL = "https://raw.githubusercontent.com/Epistimonas33/cockpit-ufw-manager/main/version.json";

const ISSUES_URL = "https://github.com/Epistimonas33/cockpit-ufw-manager/issues/new";

const PORT_RE = /^(\d{1,5})(?::(\d{1,5}))?(?:\/(tcp|udp))?$/;
const APP_RE = /^[A-Za-z][A-Za-z0-9 ._-]*$/;

let lastError = "";
let ufwActive = false;
let allRules = [];
let visibleRows = [];
let currentPolicies = { incoming: null, outgoing: null };
const selected = new Set();

function isNewerVersion(current, remote) {
    const c = current.split('.').map(Number);
    const r = remote.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const rv = r[i] || 0;
        const cv = c[i] || 0;
        if (rv > cv) return true;
        if (rv < cv) return false;
    }
    return false;
}

function checkForUpdates() {
    cockpit.spawn(["curl", "-fsSL", "--max-time", "10", CHECK_URL], { err: "ignore" })
        .done(function(output) {
            let data;
            try {
                data = JSON.parse(output);
            } catch (e) {
                return;
            }
            if (!data || typeof data.version !== "string" || typeof data.download_url !== "string") return;
            if (!data.download_url.startsWith("https://")) return;
            if (isNewerVersion(CURRENT_VERSION, data.version)) {
                showUpdateBanner(data.version, data.download_url);
            }
        })
        .fail(function(err) {
            console.log("Update check failed:", errText(err));
        });
}

function showUpdateBanner(newVersion, downloadUrl) {
    const banner = document.getElementById("updateBanner");
    banner.textContent = "";
    banner.style.display = "block";

    const box = document.createElement("div");
    box.className = "card";
    box.style.backgroundColor = "#e3f2fd";
    box.style.border = "1px solid #2196f3";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "space-between";

    const left = document.createElement("div");
    const strong = document.createElement("strong");
    strong.style.color = "#0d47a1";
    strong.textContent = "New version v" + newVersion + " available!";
    const span = document.createElement("span");
    span.style.color = "#555";
    span.style.marginLeft = "10px";
    span.textContent = "(Current: v" + CURRENT_VERSION + ")";
    left.appendChild(strong);
    left.appendChild(span);

    const right = document.createElement("div");
    const btnUpgrade = document.createElement("button");
    btnUpgrade.id = "btnUpgrade";
    btnUpgrade.textContent = "Upgrade Now";
    btnUpgrade.style.backgroundColor = "#2196f3";
    btnUpgrade.style.color = "white";
    btnUpgrade.style.border = "none";
    btnUpgrade.style.padding = "6px 12px";
    btnUpgrade.style.borderRadius = "4px";
    btnUpgrade.style.cursor = "pointer";
    right.appendChild(btnUpgrade);

    box.appendChild(left);
    box.appendChild(right);
    banner.appendChild(box);

    const progress = document.createElement("div");
    progress.id = "upgradeProgress";
    progress.style.marginTop = "5px";
    progress.style.fontWeight = "bold";
    progress.style.color = "#1565c0";
    progress.style.display = "none";
    banner.appendChild(progress);

    btnUpgrade.addEventListener("click", function() {
        confirmDialog({
            title: "Install version " + newVersion + "?",
            lines: [],
            warning: "This downloads a package from GitHub and installs it as root.",
            ackText: "I trust this release",
            confirmLabel: "Install"
        }).then(function(ok) {
            if (ok) upgradePlugin(downloadUrl);
        });
    });
}

function upgradePlugin(url) {
    const btn = document.getElementById("btnUpgrade");
    const progress = document.getElementById("upgradeProgress");

    btn.disabled = true;
    progress.style.display = "block";
    progress.textContent = "Downloading and installing the new version...";

    const cmd = `curl -sL "${url}" -o /tmp/cockpit-ufw-update.deb && apt-get install -y /tmp/cockpit-ufw-update.deb && rm /tmp/cockpit-ufw-update.deb`;

    cockpit.spawn(["bash", "-c", cmd], { superuser: "require" })
        .done(function() {
            progress.style.color = "green";
            progress.textContent = "Upgrade completed successfully. Reloading page...";
            setTimeout(function() {
                window.location.reload();
            }, 2000);
        })
        .fail(function(err) {
            btn.disabled = false;
            progress.style.color = "red";
            progress.textContent = "Upgrade failed: " + errText(err);
        });
}

function errText(err) {
    return (err && err.message) || JSON.stringify(err);
}

function showError(msg) {
    document.getElementById("errorBox").textContent = msg;
    lastError = msg;
    updateReportLink();
}

function updateReportLink() {
    const body = [
        "**Plugin version:** " + CURRENT_VERSION,
        "**Browser:** " + navigator.userAgent,
        "",
        "**What happened:**",
        "",
        "",
        "**Last error shown:**",
        lastError ? "```\n" + lastError + "\n```" : "none"
    ].join("\n");
    document.getElementById("reportBug").href = ISSUES_URL + "?body=" + encodeURIComponent(body);
}

function clearError() {
    document.getElementById("errorBox").textContent = "";
}

function ufwSpawn(args) {
    return new Promise(function(resolve, reject) {
        cockpit.spawn(["ufw"].concat(args), { superuser: "try" }).done(resolve).fail(reject);
    });
}

function confirmDialog(opts) {
    return new Promise(function(resolve) {
        const overlay = document.getElementById("modalOverlay");
        const body = document.getElementById("modalBody");
        const warn = document.getElementById("modalWarning");
        const ackRow = document.getElementById("modalAckRow");
        const ack = document.getElementById("modalAck");
        const btnOk = document.getElementById("modalConfirm");
        const btnCancel = document.getElementById("modalCancel");

        document.getElementById("modalTitle").textContent = opts.title;

        body.textContent = "";
        if (opts.lines && opts.lines.length) {
            const ul = document.createElement("ul");
            opts.lines.forEach(function(line) {
                const li = document.createElement("li");
                li.textContent = line;
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }

        warn.textContent = opts.warning || "";
        warn.style.display = opts.warning ? "block" : "none";

        document.getElementById("modalAckText").textContent = opts.ackText || "";
        ackRow.style.display = opts.ackText ? "inline-flex" : "none";
        ack.checked = false;

        btnOk.textContent = opts.confirmLabel || "Confirm";
        btnOk.className = opts.warning ? "danger" : "";
        btnOk.disabled = !!opts.ackText;

        function onKey(e) {
            if (e.key === "Escape") finish(false);
        }

        function finish(result) {
            overlay.style.display = "none";
            btnOk.onclick = null;
            btnCancel.onclick = null;
            ack.onchange = null;
            document.removeEventListener("keydown", onKey);
            resolve(result);
        }

        ack.onchange = function() { btnOk.disabled = !ack.checked; };
        btnOk.onclick = function() { finish(true); };
        btnCancel.onclick = function() { finish(false); };
        document.addEventListener("keydown", onKey);

        overlay.style.display = "flex";
        btnCancel.focus();
    });
}

function loadStatus() {
    clearError();
    Promise.all([ufwSpawn(["status", "numbered"]), ufwSpawn(["status", "verbose"])])
        .then(function(results) {
            const numbered = results[0];
            const verbose = results[1];

            document.getElementById("notInstalledCard").style.display = "none";
            document.getElementById("mainContent").style.display = "block";

            ufwActive = numbered.includes("Status: active");
            allRules = ufwActive ? parseNumberedRules(numbered) : [];
            selected.clear();

            updateStatus();
            renderRules();
            loadListeningPorts();

            const policies = parsePolicies(verbose);
            if (policies) {
                setPolicies(policies);
            } else {
                readInactivePolicies().then(setPolicies);
            }
        })
        .catch(function(err) {
            const errStr = errText(err).toLowerCase();
            if (errStr.includes("no such file") || errStr.includes("not found") || (err && err.exit_status === 127)) {
                showNotInstalledUI();
            } else {
                showError("UFW execution error: " + errText(err));
            }
        });
}

function showNotInstalledUI() {
    document.getElementById("notInstalledCard").style.display = "block";
    document.getElementById("mainContent").style.display = "none";
}

function installUFW() {
    const statusDiv = document.getElementById("installStatus");
    const btn = document.getElementById("btnInstallUFW");
    btn.disabled = true;
    statusDiv.style.color = "black";
    statusDiv.textContent = "Installing UFW...";

    cockpit.spawn(["apt-get", "update"], { superuser: "require" })
        .then(function() {
            return cockpit.spawn(["apt-get", "install", "-y", "ufw"], { superuser: "require" });
        })
        .done(function() {
            statusDiv.style.color = "green";
            statusDiv.textContent = "Installed successfully. Loading...";
            setTimeout(function() {
                btn.disabled = false;
                statusDiv.textContent = "";
                loadStatus();
            }, 2000);
        })
        .fail(function(err) {
            btn.disabled = false;
            statusDiv.style.color = "red";
            statusDiv.textContent = "Failed: " + errText(err);
        });
}

function updateStatus() {
    const badge = document.getElementById("ufwStatus");
    if (ufwActive) {
        badge.textContent = "Active";
        badge.className = "status-badge status-active";
    } else {
        badge.textContent = "Inactive";
        badge.className = "status-badge status-inactive";
    }
}

function parsePolicies(verbose) {
    const m = verbose.match(/Default:\s*(\w+)\s*\(incoming\),\s*(\w+)\s*\(outgoing\)/);
    return m ? { incoming: m[1], outgoing: m[2] } : null;
}

function readInactivePolicies() {
    return new Promise(function(resolve) {
        cockpit.spawn(["grep", "^DEFAULT_", "/etc/default/ufw"], { err: "ignore" })
            .done(function(out) {
                const map = { ACCEPT: "allow", DROP: "deny", REJECT: "reject" };
                const get = function(name) {
                    const m = out.match(new RegExp("^" + name + "=\"?(\\w+)\"?", "m"));
                    return m ? (map[m[1]] || null) : null;
                };
                resolve({ incoming: get("DEFAULT_INPUT_POLICY"), outgoing: get("DEFAULT_OUTPUT_POLICY") });
            })
            .fail(function() { resolve(null); });
    });
}

function setPolicies(policies) {
    currentPolicies = policies || { incoming: null, outgoing: null };
    document.getElementById("policyIncoming").value = currentPolicies.incoming || "";
    document.getElementById("policyOutgoing").value = currentPolicies.outgoing || "";
    document.getElementById("policyHint").textContent = ufwActive
        ? ""
        : "The firewall is inactive. These policies take effect once it is enabled.";
}

function applyPolicies() {
    const changes = [];
    [["incoming", "policyIncoming"], ["outgoing", "policyOutgoing"]].forEach(function(pair) {
        const val = document.getElementById(pair[1]).value;
        if (val && val !== currentPolicies[pair[0]]) changes.push({ dir: pair[0], val: val });
    });
    if (changes.length === 0) return;

    const warnings = [];
    const incoming = changes.find(function(c) { return c.dir === "incoming"; });
    if (incoming && incoming.val === "allow") {
        warnings.push("Allowing all incoming traffic by default exposes every listening port.");
    }
    if (incoming && incoming.val !== "allow" && ufwActive && !hasSshRule()) {
        warnings.push("No allow rule for port 22 was found. Blocking incoming traffic by default may cut off your SSH session.");
    }

    confirmDialog({
        title: "Change default policy?",
        lines: changes.map(function(c) { return c.dir + ": " + (currentPolicies[c.dir] || "unknown") + " -> " + c.val; }),
        warning: warnings.join(" "),
        ackText: warnings.length ? "I understand the risk" : null,
        confirmLabel: "Apply"
    }).then(function(ok) {
        if (!ok) return;
        clearError();
        changes.reduce(function(p, c) {
            return p.then(function() { return ufwSpawn(["default", c.val, c.dir]); });
        }, Promise.resolve())
            .then(loadStatus)
            .catch(function(err) {
                showError("Failed to change policy: " + errText(err));
                loadStatus();
            });
    });
}

function parseNumberedRules(output) {
    const rules = [];
    output.split("\n").forEach(function(line) {
        const m = line.match(/^\[\s*(\d+)\]\s+(.*\S)\s*$/);
        if (!m) return;

        const cols = m[2].split(/\s{2,}/);
        let to = m[2];
        let action = "";
        let from = "";
        if (cols.length >= 3) {
            to = cols[0];
            action = cols[1];
            from = cols.slice(2).join(" ");
        }

        rules.push({
            num: m[1],
            raw: m[2].replace(/\s+/g, " "),
            to: to,
            action: action,
            from: from,
            v6: /\(v6\)/.test(m[2])
        });
    });
    return rules;
}

function stripV6(text) {
    return text.replace(/\s*\(v6\)/g, "");
}

function buildRows(rules, group) {
    if (!group) {
        return rules.map(function(r) {
            return {
                key: r.num, nums: [r.num], raws: [r.raw],
                to: r.to, action: r.action, from: r.from,
                family: r.v6 ? "IPv6" : "IPv4"
            };
        });
    }

    const rows = [];
    const pending = new Map();
    rules.forEach(function(r) {
        const k = stripV6(r.raw);
        const mate = pending.get(k);
        if (mate && mate.v6 !== r.v6) {
            mate.row.nums.push(r.num);
            mate.row.raws.push(r.raw);
            mate.row.family = "IPv4 + IPv6";
            mate.row.key = mate.row.nums.join(",");
            pending.delete(k);
            return;
        }
        const row = {
            key: r.num, nums: [r.num], raws: [r.raw],
            to: stripV6(r.to), action: r.action, from: stripV6(r.from),
            family: r.v6 ? "IPv6" : "IPv4"
        };
        rows.push(row);
        pending.set(k, { row: row, v6: r.v6 });
    });
    return rows;
}

function isSshRule(rule) {
    return /(^|[^\d])22(\/|\s|$)/.test(rule.to) || /ssh/i.test(rule.to);
}

function hasSshRule() {
    return allRules.some(function(r) { return /ALLOW|LIMIT/.test(r.action) && isSshRule(r); });
}

function renderRules() {
    const tbody = document.getElementById("rulesBody");
    tbody.innerHTML = "";
    visibleRows = [];

    if (!ufwActive) {
        tbody.innerHTML = "<tr><td colspan='7'>The firewall is disabled.</td></tr>";
        updateBulkControls();
        return;
    }

    const group = document.getElementById("groupFamilies").checked;
    const terms = document.getElementById("ruleFilter").value.toLowerCase().split(/\s+/).filter(Boolean);

    visibleRows = buildRows(allRules, group).filter(function(row) {
        const hay = [row.nums.join(" "), row.to, row.action, row.from, row.family].join(" ").toLowerCase();
        return terms.every(function(t) { return hay.includes(t); });
    });

    const visibleKeys = new Set(visibleRows.map(function(r) { return r.key; }));
    Array.from(selected).forEach(function(k) {
        if (!visibleKeys.has(k)) selected.delete(k);
    });

    if (visibleRows.length === 0) {
        tbody.innerHTML = allRules.length === 0
            ? "<tr><td colspan='7'>No rules found.</td></tr>"
            : "<tr><td colspan='7'>No rules match the filter.</td></tr>";
        updateBulkControls();
        return;
    }

    visibleRows.forEach(function(row) {
        const tr = document.createElement("tr");

        const tdCheck = document.createElement("td");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = selected.has(row.key);
        check.addEventListener("change", function() {
            if (check.checked) selected.add(row.key);
            else selected.delete(row.key);
            updateBulkControls();
        });
        tdCheck.appendChild(check);
        tr.appendChild(tdCheck);

        [row.nums.join(", "), row.to, row.action, row.from, row.family].forEach(function(text) {
            const td = document.createElement("td");
            td.textContent = text;
            tr.appendChild(td);
        });

        const tdAction = document.createElement("td");
        const btnDelete = document.createElement("button");
        btnDelete.textContent = "Delete";
        btnDelete.addEventListener("click", function() {
            requestDelete([row]);
        });
        tdAction.appendChild(btnDelete);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });

    updateBulkControls();
}

function updateBulkControls() {
    const btn = document.getElementById("btnDeleteSelected");
    btn.textContent = "Delete selected (" + selected.size + ")";
    btn.disabled = selected.size === 0;

    const all = document.getElementById("selectAll");
    all.disabled = visibleRows.length === 0;
    all.checked = visibleRows.length > 0 && selected.size === visibleRows.length;
    all.indeterminate = selected.size > 0 && selected.size < visibleRows.length;
}

function toggleSelectAll() {
    const all = document.getElementById("selectAll");
    selected.clear();
    if (all.checked) visibleRows.forEach(function(r) { selected.add(r.key); });
    renderRules();
}

function requestDelete(rows) {
    if (rows.length === 0) return;
    const touchesSsh = rows.some(isSshRule);

    confirmDialog({
        title: rows.length === 1 ? "Delete this rule?" : "Delete " + rows.length + " rules?",
        lines: rows.map(function(r) {
            return r.nums.map(function(n) { return "[" + n + "]"; }).join(" ") + " " + [r.to, r.action, r.from].join("  ");
        }),
        warning: touchesSsh
            ? "This removes a rule for port 22 (SSH). If you are connected over SSH you may lose access to this server."
            : null,
        ackText: touchesSsh ? "I understand I may lock myself out" : null,
        confirmLabel: "Delete"
    }).then(function(ok) {
        if (ok) deleteRows(rows);
    });
}

function deleteSelected() {
    requestDelete(visibleRows.filter(function(r) { return selected.has(r.key); }));
}

function deleteRows(rows) {
    clearError();

    ufwSpawn(["status", "numbered"])
        .then(function(output) {
            const fresh = new Map(parseNumberedRules(output).map(function(r) { return [r.num, r.raw]; }));
            const items = [];
            rows.forEach(function(row) {
                row.nums.forEach(function(n, i) { items.push({ num: n, raw: row.raws[i] }); });
            });

            const stale = items.some(function(it) { return fresh.get(it.num) !== it.raw; });
            if (stale) throw new Error("STALE");

            items.sort(function(a, b) { return Number(b.num) - Number(a.num); });
            return items.reduce(function(p, it) {
                return p.then(function() { return ufwSpawn(["--force", "delete", it.num]); });
            }, Promise.resolve());
        })
        .then(function() {
            selected.clear();
            loadStatus();
        })
        .catch(function(err) {
            if (err && err.message === "STALE") {
                showError("The rule list changed in the meantime. Nothing was deleted, review the refreshed list and try again.");
            } else {
                showError("Delete failed: " + errText(err));
            }
            loadStatus();
        });
}

function validSource(src) {
    const m = src.match(/^([^/]+)(?:\/(\d{1,3}))?$/);
    if (!m) return false;
    const addr = m[1];
    const prefix = m[2];

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
        if (!addr.split(".").every(function(o) { return Number(o) <= 255; })) return false;
        return prefix === undefined || Number(prefix) <= 32;
    }
    if (/^[0-9a-fA-F:]+$/.test(addr) && addr.includes(":")) {
        return prefix === undefined || Number(prefix) <= 128;
    }
    return false;
}

function buildRuleArgs(action, source, portText, proto) {
    if (!source && !portText) return { error: "Enter a port, a source address, or both." };
    if (source && !validSource(source)) {
        return { error: "Invalid source. Use an IP address or a CIDR subnet, e.g. 192.168.1.0/24." };
    }

    let port = null;
    let app = null;
    if (portText) {
        const m = portText.match(PORT_RE);
        if (m) {
            const lo = Number(m[1]);
            const hi = m[2] === undefined ? lo : Number(m[2]);
            if (lo < 1 || hi > 65535 || hi < lo) return { error: "Invalid port or port range." };
            port = m[2] === undefined ? m[1] : m[1] + ":" + m[2];
            proto = m[3] || proto;
            if (m[2] !== undefined && !proto) return { error: "Port ranges need a protocol (tcp or udp)." };
        } else if (APP_RE.test(portText)) {
            app = portText;
        } else {
            return { error: "Invalid port. Examples: 22, 80/tcp, 8000:8100/tcp, or an app profile name." };
        }
    }

    if (!source) {
        if (app) return { args: [action, app] };
        return { args: [action, proto ? port + "/" + proto : port] };
    }

    const args = [action, "from", source];
    if (app) return { args: args.concat(["to", "any", "app", app]) };
    if (port) {
        const full = args.concat(["to", "any", "port", port]);
        return { args: proto ? full.concat(["proto", proto]) : full };
    }
    if (proto) return { args: [action, "proto", proto, "from", source, "to", "any"] };
    return { args: args };
}

function runUFW(args) {
    clearError();
    return ufwSpawn(args).then(
        function() {
            loadStatus();
            return true;
        },
        function(err) {
            showError("Command failed: " + errText(err));
            return false;
        }
    );
}

function addRule() {
    const built = buildRuleArgs(
        document.getElementById("ruleAction").value,
        document.getElementById("ruleSource").value.trim(),
        document.getElementById("rulePort").value.trim(),
        document.getElementById("ruleProto").value
    );
    if (built.error) {
        showError(built.error);
        return;
    }
    runUFW(built.args).then(function(ok) {
        if (!ok) return;
        document.getElementById("ruleSource").value = "";
        document.getElementById("rulePort").value = "";
        document.getElementById("ruleProto").value = "";
    });
}

function portCoverage(port, protocol) {
    if (!ufwActive) return null;
    const p = Number(port);
    let found = "none";

    allRules.forEach(function(r) {
        if (!/ALLOW|LIMIT/.test(r.action)) return;
        const m = r.to.match(/^(\d+)(?::(\d+))?(?:\/(tcp|udp))?/);
        if (!m) return;
        const lo = Number(m[1]);
        const hi = m[2] ? Number(m[2]) : lo;
        if (p < lo || p > hi) return;
        if (m[3] && m[3] !== protocol) return;
        if (/^Anywhere/.test(r.from)) found = "any";
        else if (found === "none") found = "restricted";
    });
    return found;
}

function parseSocketLine(line) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const protocol = parts[0];
    const portMatch = parts[4].match(/:(\d+)$/);
    if (!portMatch) return null;

    const procMatch = parts.slice(6).join(" ").match(/users:\(\("([^"]+)",pid=(\d+)/);
    return {
        protocol: protocol,
        port: portMatch[1],
        processName: procMatch ? procMatch[1] : null,
        pid: procMatch ? procMatch[2] : null
    };
}

function loadListeningPorts() {
    const tbody = document.getElementById("portsBody");

    cockpit.spawn(["ss", "-H", "-tulpn"], { superuser: "try" })
        .done(function(output) {
            tbody.innerHTML = "";

            const seen = new Set();
            const rows = [];

            output.split("\n").forEach(function(line) {
                if (!line.trim()) return;
                const parsed = parseSocketLine(line);
                if (!parsed) return;

                const key = parsed.protocol + ":" + parsed.port + ":" + (parsed.pid || "");
                if (seen.has(key)) return;
                seen.add(key);
                rows.push(parsed);
            });

            rows.sort(function(a, b) { return Number(a.port) - Number(b.port); });

            if (rows.length === 0) {
                tbody.innerHTML = "<tr><td colspan='5'>No listening ports found.</td></tr>";
                return;
            }

            rows.forEach(function(row) {
                const tr = document.createElement("tr");

                [row.protocol.toUpperCase(), row.port, row.processName || "Unknown (needs root)", row.pid || "-"].forEach(function(text) {
                    const td = document.createElement("td");
                    td.textContent = text;
                    tr.appendChild(td);
                });

                const tdFirewall = document.createElement("td");
                const badge = document.createElement("span");
                badge.className = "status-badge";
                const coverage = portCoverage(row.port, row.protocol);
                if (coverage === null) {
                    badge.textContent = "UFW inactive";
                    badge.classList.add("status-inactive");
                } else if (coverage === "any") {
                    badge.textContent = "Allowed";
                    badge.classList.add("status-active");
                } else if (coverage === "restricted") {
                    badge.textContent = "Restricted source";
                    badge.classList.add("status-warn");
                } else {
                    badge.textContent = "No rule";
                    badge.classList.add("status-inactive");
                }
                tdFirewall.appendChild(badge);
                tr.appendChild(tdFirewall);

                tbody.appendChild(tr);
            });
        })
        .fail(function(err) {
            tbody.innerHTML = "";
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 5;
            td.textContent = "Failed to read listening ports: " + errText(err);
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
}

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("btnEnable").addEventListener("click", function() { runUFW(['--force', 'enable']); });
    document.getElementById("btnDisable").addEventListener("click", function() { runUFW(['disable']); });
    document.getElementById("btnReload").addEventListener("click", function() { runUFW(['reload']); });
    document.getElementById("btnRefresh").addEventListener("click", loadStatus);
    document.getElementById("btnRefreshPorts").addEventListener("click", loadListeningPorts);
    document.getElementById("btnInstallUFW").addEventListener("click", installUFW);
    document.getElementById("btnApplyPolicies").addEventListener("click", applyPolicies);
    document.getElementById("btnAdd").addEventListener("click", addRule);
    document.getElementById("btnDeleteSelected").addEventListener("click", deleteSelected);
    document.getElementById("selectAll").addEventListener("change", toggleSelectAll);
    document.getElementById("ruleFilter").addEventListener("input", renderRules);
    document.getElementById("groupFamilies").addEventListener("change", function() {
        selected.clear();
        renderRules();
    });

    ["ruleSource", "rulePort"].forEach(function(id) {
        document.getElementById(id).addEventListener("keydown", function(e) {
            if (e.key === "Enter") addRule();
        });
    });

    document.getElementById("versionLabel").textContent = "v" + CURRENT_VERSION;
    updateReportLink();

    loadStatus();
    checkForUpdates();
});
