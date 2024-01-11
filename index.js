/*
 * Example: 018cf71c-9ce7-378c-8b86-86f037a55de4
 */

const https = require('https');
const AdmZip = require('adm-zip');
const yaml = require('yaml');
const fs = require('fs').promises;
const path = require('path');

async function getURL(urlString) {
    urlString.port = 443;
    
    return new Promise((resolve, reject) => {
        const options = new URL(urlString);
        let response = "";

        const request = https.request(options, (res) => {
            console.log(`${urlString}: ${res.statusCode}`);

            res.on('data', (d) => {
                response += d;
            });
            res.on('end', () => {
                resolve(response);
            });
        });
        request.on('error', reject);
        request.end();
    });
}

async function getMods() {
    const allmods = JSON.parse(await getURL(`https://thunderstore.io/c/lethal-company/api/v1/package/`));
    const database = {};

    for (const mod of allmods) {
        database[mod.full_name] = mod;
    }

    return database;
}

async function getDepList(code) {
    /* Fetch mod list from thunderstore.io */
    const database = await getMods();
    
    /* Fetch and filter our profile code */
    const response = await getURL(`https://gcdn.thunderstore.io/live/modpacks/legacyprofile/${code}`);
    const binary = Buffer.from(response.split(/\n/g)[1], "base64");
    
    var zip = new AdmZip(binary);    
    const mods = yaml.parse(zip.readAsText("mods.yml"));
    const dependancies = [];

    /* Prefilter packages that are disabled, or are modpacks */
    return mods.filter((mod) => {
        if (!mod.enabled || database[mod.name].categories.indexOf('Modpacks') >= 0) {
            return false;
        }

        const deps = mod.dependencies.map((dep) => dep.match(/^[a-zA-Z0-9_]+-[a-zA-Z0-9_]+/)[0]);
        dependancies.push(... deps);

        return true;
    }).filter((mod) => {
        return dependancies.indexOf(mod.name) < 0;
    }).map((mod) => database[mod.name].versions[0].full_name);
}

function* diff(a, b) {
    if (a.indexOf(b) < 0) return b;
}

async function main() {
    const depList = await getDepList(process.argv[2]);
    console.log(depList);

    const totalPath = `${process.argv[1]}/WhalesCompany/manifest.json`;
    const manifest = JSON.parse(await fs.readFile(totalPath, 'utf-8'));
    const changes = [];

    for (let removed of diff(depList, manifest.dependencies)) {
        changes.push(`-${removed}`);
    }
    for (let added of diff(manifest.dependencies, depList)) {
        changes.push(`+${added}`);
    }

    console.log(changes);
}

main();
