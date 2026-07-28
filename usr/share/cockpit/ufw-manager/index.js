const CURRENT_VERSION = "1.0.0";
const CHECK_URL = "https://raw.githubusercontent.com/Epistimonas33/cockpit-ufw-manager/main/version.json";

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
    fetch(CHECK_URL, { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error("bad response");
            return response.json();
        })
        .then(data => {
            if (!data || typeof data.version !== "string" || typeof data.download_url !== "string") return;
            if (!data.download_url.startsWith("https://")) return;
            if (isNewerVersion(CURRENT_VERSION, data.version)) {
                showUpdateBanner(data.version, data.download_url);
            }
        })
        .catch(err => {
            console.log("Update check failed:", err);
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
        if (!confirm(`Install version ${newVersion} now? This will download and install a package as root.`)) return;
        upgradePlugin(downloadUrl);
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
            progress.textContent = "Upgrade failed: " + (err.message || JSON.stringify(err));
        });
}

function showError(msg) {
    document.getElementById("errorBox").textContent = msg;
}

function clearError() {
    document.getElementById("errorBox").textContent = "";
}

function loadStatus() {
    clearError();
    cockpit.spawn(["ufw", "status", "numbered"], { superuser: "try" })
        .done(function(data) {
            document.getElementById("notInstalledCard").style.display = "none";
            document.getElementById("mainContent").style.display = "block";
            updateStatus(data);
            parseRules(data);
        })
        .fail(function(err) {
            const errStr = (err.message || JSON.stringify(err)).toLowerCase();
            if (errStr.includes("no such file") || errStr.includes("not found") || err.exit_status === 127) {
                showNotInstalledUI();
            } else {
                showError("UFW execution error: " + (err.message || JSON.stringify(err)));
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
            statusDiv.textContent = "Failed: " + (err.message || JSON.stringify(err));
        });
}

function updateStatus(output) {
    const badge = document.getElementById("ufwStatus");
    if (output.includes("Status: active")) {
        badge.textContent = "Active";
        badge.className = "status-badge status-active";
    } else {
        badge.textContent = "Inactive";
        badge.className = "status-badge status-inactive";
    }
}

function parseRules(output) {
    const tbody = document.getElementById("rulesBody");
    tbody.innerHTML = "";

    if (output.includes("Status: inactive")) {
        tbody.innerHTML = "<tr><td colspan='3'>The firewall is disabled.</td></tr>";
        return;
    }

    const lines = output.split("\n");
    let count = 0;

    lines.forEach(line => {
        const match = line.match(/^\[\s*(\d+)\]\s+(.*)/);
        if (!match) return;

        count++;
        const num = match[1];
        const ruleDetail = match[2];

        const tr = document.createElement("tr");

        const tdNum = document.createElement("td");
        tdNum.textContent = num;

        const tdDetail = document.createElement("td");
        tdDetail.textContent = ruleDetail;

        const tdAction = document.createElement("td");
        const btnDelete = document.createElement("button");
        btnDelete.textContent = "Delete";
        btnDelete.addEventListener("click", function() {
            deleteRule(num);
        });
        tdAction.appendChild(btnDelete);

        tr.appendChild(tdNum);
        tr.appendChild(tdDetail);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });

    if (count === 0) {
        tbody.innerHTML = "<tr><td colspan='3'>No rules found.</td></tr>";
    }
}

function runUFW(args) {
    clearError();
    cockpit.spawn(["ufw"].concat(args), { superuser: "try" })
        .done(function() {
            loadStatus();
        })
        .fail(function(err) {
            showError("Command failed: " + (err.message || JSON.stringify(err)));
        });
}

function addPort() {
    const input = document.getElementById("portInput");
    const val = input.value.trim();
    if (!val) return;
    runUFW(["allow", val]);
    input.value = "";
}

function deleteRule(num) {
    if (!confirm(`Delete rule [${num}]?`)) return;
    runUFW(["--force", "delete", num.toString()]);
}

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("btnEnable").addEventListener("click", function() { runUFW(['--force', 'enable']); });
    document.getElementById("btnDisable").addEventListener("click", function() { runUFW(['disable']); });
    document.getElementById("btnReload").addEventListener("click", function() { runUFW(['reload']); });
    document.getElementById("btnRefresh").addEventListener("click", loadStatus);
    document.getElementById("btnAdd").addEventListener("click", addPort);
    document.getElementById("btnInstallUFW").addEventListener("click", installUFW);

    loadStatus();
    checkForUpdates();
});
