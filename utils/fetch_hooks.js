const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))

require('dotenv').config({
    path: path.join(__dirname, '..', '.env')
});

const { createClient } = require("redis");

const redis_client = createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
redis_client.connect();

let hooks = [];
var twitch = require(path.join(__dirname, '..', 'modules', 'twitch'))({ redis_client });

process.on('twitch_token', (thing) => {
    fetchPage();
});

function fetchPage(after) {
    fetch(
        'https://api.twitch.tv/helix/eventsub/subscriptions?first=100' + (after ? '&after='+after : ''),
        {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': 'Bearer ' + twitch.access_token,
                'Accept': 'application/json'
            },
        }
    )
    .then(resp => resp.json())
    .then(resp => {
        console.log('Found', resp.data.length);
        hooks = hooks.concat(resp.data);

        if (resp.pagination && resp.pagination.cursor) {
            fetchPage(resp.pagination.cursor);
        } else {
            write();
        }
    })
    .catch(err => {
        console.log(err);
    });
}

function write() {
    fs.writeFileSync(
        path.join(
            __dirname,
            'hooks.json'
        ),
        JSON.stringify(
            hooks,
            null,
            4
        )
    );
    process.exit();
}
