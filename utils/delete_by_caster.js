const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))

require('dotenv').config({
    path: path.join(__dirname, '..', '.env')
});

const mysql = require('mysql');
const mysql_pool = mysql.createPool({
    "host":             process.env.DATABASE_HOST,
    "user":             process.env.DATABASE_USER,
    "password":         process.env.DATABASE_PASSWORD,
    "database":         process.env.DATABASE_DATABASE,
    "connectionLimit":  2,
    "charset":          process.env.DATABASE_CHARSET
});

const { createClient } = require("redis");

const redis_client = createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
redis_client.connect();


var twitch = require(path.join(__dirname, '..', 'modules', 'twitch'))({ redis_client });

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

process.on('twitch_token', (thing) => {
    rl.question('TwitchID> ', (id) => {
        console.log('Get and nail', id);

        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json())
        .then(resp => {
            console.log('Found', resp.data.length);
            for (var x=0;x<resp.data.length;x++) {
                console.log(x, resp.data[x].type, resp.data[x].condition.broadcaster_user_id, id);
                if (resp.data[x].condition.broadcaster_user_id == id) {
                    wackmax++;
                    deleteHook(resp.data[x].id);
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
    fetch(
        'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
        {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': 'Bearer ' + twitch.access_token
            },
            method: 'DELETE'
        }
    )
    .then(resp => {
        console.log('Nailed with', resp.status);
    })
    .catch(err => {
        console.error('Failed with', err.response.status);
    })
    .finally(() => {
        wackings++;
        console.log('completed', wackings, wackmax);
        if (wackings >= wackmax) {
            process.exit();
        }
    });
}
