const fs = require('fs');
const path = require('path');

const got = require('got');

const config = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    '..',
    'config.json'
)));

config.database.connectionLimit = 1;

const mysql = require('mysql');
const mysql_pool = mysql.createPool(config.database);

const redis = require('redis');
const redis_client = redis.createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});

var twitch = require(path.join(__dirname, '..', 'modules', 'twitch'))({ config, redis_client });

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

process.on('twitch_token', (thing) => {
    rl.question('TwitchID> ', (id) => {
        console.log('Get and nail', id);

        got({
            url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
            headers: {
                'Client-ID': config.twitch.client_id,
                'Authorization': 'Bearer ' + twitch.access_token
            },
            responseType: 'json'
        })
        .then(resp => {
            console.log('Found', resp.body.data.length);
            for (var x=0;x<resp.body.data.length;x++) {
                console.log(x, resp.body.data[x].type, resp.body.data[x].condition.broadcaster_user_id, id);
                if (resp.body.data[x].condition.broadcaster_user_id == id) {
                    wackmax++;
                    deleteHook(resp.body.data[x].id);
                }
            }
            if (wackmax == 0) {
                console.log('Nothing to wack');
                process.exit();
            }
        })
        .catch(err => {
            console.log(err);
        });
    });
});

var wackings = 0;
var wackmax = 0;
function deleteHook(id) {
    got({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
        headers: {
            'Client-ID': config.twitch.client_id,
            'Authorization': 'Bearer ' + twitch.access_token
        },
        method: 'DELETE'
    })
    .then(resp => {
        console.log('Nailed with', resp.statusCode);
    })
    .catch(err => {
        console.error('Failed with', err.response.statusCode);
    })
    .finally(() => {
        wackings++;
        console.log('completed', wackings, wackmax);
        if (wackings >= wackmax) {
            process.exit();
        }
    });
}
