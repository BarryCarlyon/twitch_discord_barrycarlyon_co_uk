const fs = require('fs');
const path = require('path');

const express = require('express');
const crypto = require('crypto');

module.exports = function(lib) {
    let { config, mysql_pool, eventsub, redis_client } = lib;

    const router = express.Router();

    router.use(express.json({
        verify: function(req, res, buf, encoding) {
            // is there a hub to verify against
            req.twitch_hub = false;
            if (req.headers && req.headers.hasOwnProperty('twitch-eventsub-message-signature')) {
                req.twitch_hub = true;

                // id for dedupe
                var id = req.headers['twitch-eventsub-message-id'];
                // check age
                var timestamp = req.headers['twitch-eventsub-message-timestamp'];

                var xHub = req.headers['twitch-eventsub-message-signature'].split('=');

                // you could do
                // req.twitch_hex = crypto.createHmac(xHub[0], config.hook_secret)
                // but we know Twitch always uses sha256
                req.twitch_hex = crypto.createHmac('sha256', config.twitch.eventsub.secret)
                    .update(id + timestamp + buf)
                    .digest('hex');
                req.twitch_signature = xHub[1];

/*
                // example test included for reference
                if (req.twitch_signature != req.twitch_hex) {
                    console.error('Signature Mismatch');
                } else {
                    console.log('Signature OK');
                }
*/
            }
        }
    }));

    router.post('/', (req, res) => {
        if (!req.twitch_hub) {
            console.error('EventSub: no Signature');
            res.status(403).send('Missing EventSub Signature');
            return;
        }

        if (req.twitch_signature != req.twitch_hex) {
            console.error('EventSub: invalid Signature');
            res.status(403).send('Invalid Signature');
            return;
        }

        log_queue.push({
            body: req.body,
            headers: req.headers
        });

        switch (req.headers['twitch-eventsub-message-type']) {
            case 'webhook_callback_verification':
                console.log('Process challenge');
                // is it an expected eventsub for one of the users on the platform?

                // ok
                res.status(200).send(encodeURIComponent(req.body.challenge));

                // delay recheck
                /*
                setTimeout(() => {
                    eventsub.check(req.headers['twitch-eventsub-message-id']);
                }, 10000);
                */

                break;
            case 'revocation':
                console.log('Process revocation');
                res.status(200).send('Ok');
                break;
            case 'notification':
                // we got a message we'll OK
                // then punt the reset for background processing
                res.status(200).send('Ok');

                console.log('Got a notification', req.body.subscription.type, 'send', 'twitch_discord:' + req.body.subscription.type);

                redis_client.publish(
                    'twitch_discord:' + req.body.subscription.type,
                    JSON.stringify(req.body),
                    (e,r) => {
                        if (e) {
                            console.log('Redis Broadcast Error', e);
                        } else {
                            // done
                        }
                    }
                );

                break;
            default:
                console.error('EventSub: Unexpected Message', req.headers['twitch-eventsub-message-type']);
                res.status(403).send('Unexpected Message');
        }
    });

    return router;
}

let log_queue = [];

setInterval(() => {
    if (log_queue.length > 0) {
        let line = log_queue.shift();

        fs.appendFileSync(path.join(
            __dirname,
            '..',
            'logs',
            'webhooks.log'
        ), JSON.stringify(line) + "\n");

        // pretty print the last webhook to a file
        fs.writeFileSync(path.join(
            __dirname,
            '..',
            'logs',
            'last_webhooks.log'
        ), JSON.stringify(line, null, 4));
    }
}, 250);
