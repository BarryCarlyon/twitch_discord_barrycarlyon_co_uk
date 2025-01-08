module.exports = function(lib) {
    let { redis_client } = lib;

    let twitch = {};

    twitch.access_token = '';

    function validateToken() {
        console.log('validateToken');
        let token = {};

        redis_client.HGET(
            'twitch_auth',
            'client_credentials_' + process.env.TWITCH_CLIENT_ID
        )
        .then(loaded_token => {
            // no token create one
            if (!loaded_token) {
                throw new Error('No Token Generate');
                return;
            }

            // parse token
            token = JSON.parse(loaded_token);

            // got a token validate it
            return fetch(
                'https://id.twitch.tv/oauth2/validate',
                {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + token.access_token,
                        'Accept': 'application/json'
                    },
                }
            )
        })
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            console.log('validate resp', resp.body);
            if (!resp.body.expires_in) {
                createToken();
                return;
            }
            if (resp.body.expires_in < 3600) {
                createToken();
                return;
            }

            twitch.access_token = token.access_token;
            process.emit('twitch_token', '');
        })
        .catch(err => {
            console.error(err);
            // well thats dumb
            createToken();
        });


    }
    validateToken();
    setInterval(() => {
        validateToken();
    }, (30 * 60 * 1000));

    function createToken() {
        let url = new URL('https://id.twitch.tv/oauth2/token');
        let params = [
            [ 'client_id', process.env.TWITCH_CLIENT_ID ],
            [ 'client_secret', process.env.TWITCH_CLIENT_SECRET ],
            [ 'grant_type', 'client_credentials' ],
        ]
        url.search = new URLSearchParams(params).toString();

        fetch(
            url,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            resp.body.client_id = process.env.TWITCH_CLIENT_ID;

            return redis_client.HSET(
                'twitch_auth',
                'client_credentials_' + resp.body.client_id,
                JSON.stringify(resp.body)
            );
        })
        .then(r => {
            console.log('Token stored');
            validateToken();
        })
        .catch(err => {
            if (err.response) {
                console.error('Token Generate error', err.response.status, err.response.body);
            } else {
                console.error('Token Generate error', err);
            }
        })
    }

    return twitch;
}
