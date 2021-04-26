const fs = require('fs');
const path = require('path');

const got = require('got');

const express = require('express');

const crypto = require('crypto');

const config = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    'config.json'
)));

/*
Server
*/
const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.locals.basedir = path.join(__dirname, 'views');

app.set('view options', {
   debug: false,
   compileDebug: false
})

app.use('/', express.static(path.join(__dirname, 'public')));

/* interfaces */
const http = require('http').Server(app);
http.listen(config.server.listen, () => {
    console.log('Server raised on', config.server.listen);
});

const mysql = require('mysql');
const mysql_pool = mysql.createPool(config.database);

const redis = require('redis');
const redis_client = redis.createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
//const redis_subscribe = redis.createClient();
//redis_subscribe.on('error', (err) => {
//    console.error('REDIS Error', err);
//});

/*
Generate a random string at start up
To secure sessions with
This means when the server restarts, it'll generate a new string
And log everyone out
*/
var secret = crypto.randomBytes(64).toString('hex');

/* Session */
const sess = require('express-session');
const RedisStore = require('connect-redis')(sess);
// Usually you'll put the node process
// behind a proxy such as nginx
// so that proxy will handle the SSL Certs
// trust proxy will tell the session handler to trust the SSL ness of the cookie
// see also https://expressjs.com/en/guide/behind-proxies.html
// for other options you may want to use something more specific than a true
app.set('trust proxy', 1);

const session = sess({
    store: new RedisStore({
        client: redis_client
    }),
    secret,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: false
    },
    rolling: true
});

// you can set the cookie max age
//cookie: {
//        maxAge: (30 * 60 * 1000)

// this example sets the cookie to secure false
// you should set to true when hosting over SSL
// it's false for the http://localhost/ testing of this example.

app.use(session);

/*
Generic Error logger
*/
app.use((err, req, res, next) => {
    //console.log('in here');
    if (err) {
        console.log(err);
    }
    next(err);
});

/*
register some pug globals
*/
app.use((req, res, next) => {
    res.locals.twitch_client_id = config.twitch.client_id;
    if (req.session.error) {
        res.locals.error = req.session.error;
        delete req.session.error;
        console.log('Captured error', res.locals.error);
    }
    if (req.session.success) {
        res.locals.success = req.session.success;
        delete req.session.success;
    }

//    res.locals.user = false;
//    if (req.session.user) {
//        res.locals.user = req.session.user;
//    }

    // temp debug
    res.locals.session = req.session;
    //res.locals.debug_session = JSON.stringify(req.session, null, 4);

    next();
});

/*
Logout super important
*/
app.get('/logout', (req,res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/privacy', (req,res) => {
    res.render('privacy');
});

// modules
var twitch = require(path.join(__dirname, 'modules', 'twitch'))({ config, mysql_pool, redis_client });
var eventsub = require(path.join(__dirname, 'modules', 'eventsub'))({ config, mysql_pool, twitch });
var discord = require(path.join(__dirname, 'modules', 'discord'))({ config, mysql_pool, twitch });

// routes
app.use('/eventsub/', require(path.join(__dirname, 'routes', 'eventsub'))({ config, mysql_pool, eventsub, redis_client }));
app.use('/login/', require(path.join(__dirname, 'routes', 'login'))({ config, mysql_pool }));
app.use('/admin/', require(path.join(__dirname, 'routes', 'admin'))({ config, mysql_pool, eventsub, discord }));

// backup route
app.get('/', (req,res) => {
    res.render('home');
});
