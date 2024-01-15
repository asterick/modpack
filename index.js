/*
 * Example: 018cf71c-9ce7-378c-8b86-86f037a55de4
 */

const https = require('https');
const AdmZip = require('adm-zip');
const yaml = require('yaml');
const fs = require('fs').promises;
const path = require('path');

const PACKAGE_NAME = /^[a-zA-Z0-9_]+-[a-zA-Z0-9_]+/;

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

        const deps = mod.dependencies.map((dep) => dep.match(PACKAGE_NAME)[0]);
        dependancies.push(... deps);

        return true;
    }).filter((mod) => {
        return dependancies.indexOf(mod.name) < 0;
    }).map((mod) => database[mod.name].versions[0].full_name);
}

function* diff(a, b) {
    for (const c of b) {
        if (a.indexOf(c) < 0) yield `-${c}`;
    }

    for (const c of a) {
        if (b.indexOf(c) < 0) yield `+${c}`;
    }
}

async function main() {
    const depList = await getDepList(process.argv[2]);

    const totalPath = `${process.argv[1]}/package/manifest.json`;
    const manifest = JSON.parse(await fs.readFile(totalPath, 'utf-8'));

    /* Determine changes in dep list */
    const newNames = manifest.dependencies.map((b) => b.match(PACKAGE_NAME)[0]);
    const oldNames = depList.map((b) => b.match(PACKAGE_NAME)[0]);
    const changes = [... diff(oldNames, newNames)];

    if (changes.length == 0) {
        console.log("No changes");
        return ;
    }

    /* Update manifest, bump version number */
    let [_, major, minor, patch] = manifest.version_number.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/);
    const version_number = `${major}.${minor}.${++patch}`;

    manifest.dependencies = depList;
    manifest.version_number = version_number;

    await fs.writeFile(totalPath, JSON.stringify(manifest, null, 2), 'utf-8')

    /* Add diff to README.md */
    await fs.appendFile(`${process.argv[1]}/package/README.md`, `\n${version_number}\n======\n* ${changes.join("\n* ")}\n`, 'utf-8')
}

main();
