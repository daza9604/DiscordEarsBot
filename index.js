//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////
function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};
__originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////
//////////////////////////////////////////

const fs = require('fs');
const util = require('util');
const path = require('path');
const { Readable } = require('stream');

//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////

function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convert_audio(input) {
    try {
        // stereo to mono channel
        const data = new Int16Array(input)
        const ndata = data.filter((el, idx) => idx % 2);
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAI_TOK = null; 
let SPEECH_METHOD = 'vosk'; // witai, google, vosk

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.DISCORD_TOK;
        WITAI_TOK = CFG_DATA.WITAI_TOK;
        SPEECH_METHOD = CFG_DATA.SPEECH_METHOD;
    }
    DISCORD_TOK = process.env.DISCORD_TOK || DISCORD_TOK;
    WITAI_TOK = process.env.WITAI_TOK || WITAI_TOK;
    SPEECH_METHOD = process.env.SPEECH_METHOD || SPEECH_METHOD;

    if (!['witai', 'google', 'vosk'].includes(SPEECH_METHOD))
        throw 'invalid or missing SPEECH_METHOD'
    if (!DISCORD_TOK)
        throw 'invalid or missing DISCORD_TOK'
    if (SPEECH_METHOD === 'witai' && !WITAI_TOK)
        throw 'invalid or missing WITAI_TOK'
    if (SPEECH_METHOD === 'google' && !fs.existsSync('./gspeech_key.json'))
        throw 'missing gspeech_key.json'
    
}
loadConfig()

const https = require('https')
function listWitAIApps(cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps?offset=0&limit=100',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })

    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps/' + appID,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }
    const data = JSON.stringify({
      lang
    })

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.write(data)
    req.end()
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


const Discord = require('discord.js')
const DISCORD_MSG_LIMIT = 2000;
const discordClient = new Discord.Client()
if (process.env.DEBUG)
    discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
    
    
    console.log(`Logged in as ${discordClient.user.tag}!`)
    
    //lo mio
    const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/listoyalaespera.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err))
    //lo mio
    
    
})
discordClient.login(DISCORD_TOK)

const PREFIX = '*';
const _CMD_HELP        = PREFIX + 'help';
const _CMD_JOIN        = PREFIX + 'join';
const _CMD_LEAVE       = PREFIX + 'leave';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'hello';
const _CMD_LANG        = PREFIX + 'lang';

const guildMap = new Map();


discordClient.on('message', async (msg) => {
    
    
    
    try {
        if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
        const mapKey = msg.guild.id;
        if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
            if (!msg.member.voice.channelID) {
                msg.reply('Error: please join a voice channel first.')
            } else {
                if (!guildMap.has(mapKey))
                    await connect(msg, mapKey)
                else
                    msg.reply('Already connected')
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Channel) val.voice_Channel.leave()
                if (val.voice_Connection) val.voice_Connection.disconnect()
                guildMap.delete(mapKey)
                msg.reply("Disconnected.")
            } else {
                msg.reply("Cannot leave because not connected.")
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
            msg.reply(getHelpString());
        }
        else if (msg.content.trim().toLowerCase() == _CMD_DEBUG) {
            console.log('toggling debug mode')
            let val = guildMap.get(mapKey);
            if (val.debug)
                val.debug = false;
            else
                val.debug = true;
        }
        else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
            msg.reply('hello back =)')
        }
        else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
            if (SPEECH_METHOD === 'witai') {
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              listWitAIApps(data => {
                if (!data.length)
                  return msg.reply('no apps found! :(')
                for (const x of data) {
                  updateWitAIAppLang(x.id, lang, data => {
                    if ('success' in data)
                      msg.reply('succes!')
                    else if ('error' in data && data.error !== 'Access token does not match')
                      msg.reply('Error: ' + data.error)
                  })
                }
              })
            } else if (SPEECH_METHOD === 'vosk') {
              let val = guildMap.get(mapKey);
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              val.selected_lang = lang;
            } else {
              msg.reply('Error: this feature is only for Google')
            }
        }
        
       
        
        
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
        
            
    
    //lo mio
    /*
    
    
    
        if (message.content.includes('callate'))
        message.channel.send('Callate tu oe');  
    
    if (message.content === '!hora'){
        
        var fecha= new Date();
        var hora_actual = fecha.getHours();
        var mihora = 0;
        if (hora_actual === 0 || hora_actual === 12) mihora = 7;
        if (hora_actual === 1 || hora_actual === 13) mihora = 8;
        if (hora_actual === 2 || hora_actual === 14) mihora = 9;
        if (hora_actual === 3 || hora_actual === 15) mihora = 10;
        if (hora_actual === 4 || hora_actual === 16) mihora = 11;
        if (hora_actual === 5 || hora_actual === 17) mihora = 12;
        if (hora_actual === 6 || hora_actual === 18) mihora = 1;
        if (hora_actual === 7 || hora_actual === 19) mihora = 2;
        if (hora_actual === 8 || hora_actual === 20) mihora = 3;
        if (hora_actual === 9 || hora_actual === 21) mihora = 4;
        if (hora_actual === 10 || hora_actual === 22) mihora = 5;
        if (hora_actual === 11 || hora_actual === 23) mihora = 6;
        
        message.channel.send(mihora);
        
        
    }
        
    if (message.content.includes('keyboard'))
        message.channel.send('ear play ' + message.content);  

    if (message.content === 'LOOT')
        message.channel.send('En LOOT te ayudamos a alcanzar tu sue\361o de convertirte en streamer. Para m\341s info visita https://www.flowcode.com/page/loot.tv');

 
    if (message.content === 'probando')
        message.reply('sigo vivo');

    if (message.content === '!looti')
        message.reply('Hola! Soy Looti, tu bot de informacion');

    if (message.content === '!website')
        message.channel.send('Todavia est\341 en desarrollo, pero cuando la terminemos el link ser\341 https://lootwebsite.herokuapp.com/ o http://lootpe.ml/');

    
    //para el nitro gratis
    if (message.content.includes('NITRO') || message.content.includes('free') || message.content.includes('https://djscord-gifts.com/events') || message.content.includes('https://dicsordnitr.xyz/nitro/login') || message.content.includes('nitro') || message.content.includes('Nitro') || message.content.includes('https://nitrogifz.xyz/nitro')){        
       //mensaje para mi
        discordClient.users.fetch('428942076852436996', false).then((user) => { user.send('Al csm de ' + message.author.tag + ' lo enga\361aron con lo del nytro gratis'); });
         
        // mensaje para zerman
        discordClient.users.fetch('586393015128686602', false).then((user) => { user.send('Al csm de ' + message.author.tag + ' lo enga\361aron con lo del nytro gratis'); });
       
        if(message.author.id === '428942076852436996' || message.author.id === '586393015128686602') //osea si es daza (o zz) osea yo xd osea esa es mi id
            message.channel.send('Uno chambeando aqui como huevon 24-7 y vienes a bromer con eso, cuidado ah');
        else{
        message.member.kick([]);
        message.delete(); 
        }
            
        //message.channel.send('No le crean banda, nunca les van a regalar una suscripción a N-i-t-r-o');    
        //message.author.send('Te hemos timeout  de 24 horas para que arregles tu situacion, podras seguir viendo el servidor pero no interactuar en el, los mensajes relacionados al nitro han sido borrados');
        //message.channel.send('https://i.ibb.co/Z1xYyHJ/listo.png');
                
    }
 
    //if (message.content.includes('?'))
    //    message.channel.send('https://i.ibb.co/gVqHn7m/la-verdadera-pregunta-es-donde-est-mcqueen.png');
    
  
    
    //LO DE DENTRO DEL IF ES PA ENVIAR MENSAJES A UN USUARIO EN ESPECIFICO
    //if (message.content.includes('potorroto'))
    //   client.users.fetch('428942076852436996', false).then((user) => { user.send('hello world'); });

    
    //comandos efectos de sonido
    
    if (message.content === '!lofi'){
        
        var rand = parseInt(Math.random()*10);        
        if (rand === 1){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi1.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        
        if (rand === 2){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand === 3){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi3.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand === 4){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi4.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand === 5){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi5.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand === 6){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi6.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand === 7){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi7.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand >= 8){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/lofi8.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        

    }
    
    
    if (message.content === '!thegrefg'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/thegrefgepic.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content === '!fiufiu' || message.content.includes('few') || message.content.includes('phew')){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/fiufiu.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    if (message.content === '!something'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/something.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!tortug'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/tortug.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    if (message.content === '!chambear'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/chambear.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    
    if (message.content === '!peru') {
        
        var rand = parseInt(Math.random()*10); 
        
        if (rand <= 3){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/peru1.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand > 3 && rand < 6) {
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/peru2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        if (rand >= 6 && rand <=9) {
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/peru3.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
        
    }
    
   
    
    if (message.content === '!coke') {
        var rand = parseInt(Math.random()*10);        
        if (rand < 5){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/coke.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        else {
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/coke2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
    }
    
    
        if (message.content === '!pedo' || message.content.includes('fart') || message.content.includes('fuck')) {
        var rand = parseInt(Math.random()*10);        
        if (rand < 5){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/pedo1.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        else {
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/pedo2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
    }
    
    
    
    
    if (message.content === '!spiderman'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/spiderman.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!omg'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/omg.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content === '!negocios'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/hombredenegocios.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    if (message.content === '!tengotodo'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/tengotodo.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    
    if (message.content === '!sismo'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/sismo2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content === '!exitosa'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/exitosa.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!poto'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/terriblepoto.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content === '!rpp'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/larotativa.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
  
    if (message.content === '!dlh'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/dlhtd.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!ibai'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/ibai.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content === '!siu'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/siu.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    
    if (message.content === '!amongus' || message.content.includes('among')){
        
        var rand = parseInt(Math.random()*10);        
        if (rand < 5){
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/amongus2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        else {
           var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/amongus.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err)); 
            
        }
        
    }
    
    
    
     if (message.content === '!gog2'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/awesome2.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!ronquido'){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/ronquido.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
     if (message.content === '!tripa' || message.content.includes('comment')){
        
        var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/tripa.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    //avisos streams
    
    if (message.content.includes('(strmrcplsnt)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directomarc.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
    if (message.content.includes('(strmchnto)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directomichanto.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
        
    }
    
    
      if (message.content.includes('(strzzrmn)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directozerman.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
    
    
    if (message.content.includes('(lvw)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directoleu.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
    
    if (message.content.includes('(dvltw)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directodeval.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
   if (message.content.includes('(nlynd)')){
        
        const voiceChannel = discordClient.channels.cache.get("768841944309694520");
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/directoneo.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
    
    
    if (message.content.includes('bring') || message.content.includes('breen') || message.content.includes('brink') || message.content.includes('looting')){
        
       var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/siu.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
    
    if (message.content.includes('admin')){
        
       var voiceChannel = message.member.voice.channel;        
        voiceChannel.join().then(connection =>{            
            const dispatcher = connection.play('./sonido/noestadaza.mp3');            
            dispatcher.on("end", end => {voiceChannel.leave();});        
        }).catch(err => console.log(err));
    }
    
    
    
    
    */
    //lo mio
    
    
        
    }
})

function getHelpString() {
    let out = '**COMMANDS:**\n'
        out += '```'
        out += PREFIX + 'join\n';
        out += PREFIX + 'leave\n';
        out += PREFIX + 'lang <code>\n';
        out += '```'
    return out;
}

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: The text channel does not exist!");
        let voice_Connection = await voice_Channel.join();
        voice_Connection.play(new Silence(), { type: 'opus' });
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            'selected_lang': 'en',
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}

const vosk = require('vosk');
let recs = {}
if (SPEECH_METHOD === 'vosk') {
  vosk.setLogLevel(-1);
  // MODELS: https://alphacephei.com/vosk/models
  recs = {
    'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
    // 'fr': new vosk.Recognizer({model: new vosk.Model('vosk_models/fr'), sampleRate: 48000}),
    // 'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
  }
  // download new models if you need
  // dev reference: https://github.com/alphacep/vosk-api/blob/master/nodejs/index.js
}


function speak_impl(voice_Connection, mapKey) {
    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield == 0 || user.bot) {
            return
        }
        console.log(`I'm listening to ${user.username}`)
        // this creates a 16-bit signed PCM, stereo 48KHz stream
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => { 
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        })
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer)
            const duration = buffer.length / 48000 / 4;
            console.log("duration: " + duration)

            if (SPEECH_METHOD === 'witai' || SPEECH_METHOD === 'google') {
            if (duration < 1.0 || duration > 19) { // 20 seconds max dur
                console.log("TOO SHORT / TOO LONG; SKPPING")
                return;
            }
            }

            try {
                let new_buffer = await convert_audio(buffer)
                let out = await transcribe(new_buffer, mapKey);
                if (out != null)
                    process_commands_query(out, mapKey, user);
            } catch (e) {
                console.log('tmpraw rename: ' + e)
            }


        })
    })
}

function process_commands_query(txt, mapKey, user) {
    if (txt && txt.length) {
        let val = guildMap.get(mapKey);
        val.text_Channel.send(txt)
    }
}


//////////////////////////////////////////
//////////////// SPEECH //////////////////
//////////////////////////////////////////
async function transcribe(buffer, mapKey) {
  if (SPEECH_METHOD === 'witai') {
      return transcribe_witai(buffer)
  } else if (SPEECH_METHOD === 'google') {
      return transcribe_gspeech(buffer)
  } else if (SPEECH_METHOD === 'vosk') {
      let val = guildMap.get(mapKey);
      recs[val.selected_lang].acceptWaveform(buffer);
      let ret = recs[val.selected_lang].result().text;
      console.log('vosk:', ret)
      return ret;
  }
}

// WitAI
let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
async function transcribe_witai(buffer) {
    try {
        // ensure we do not send more than one request per second
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());    
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }

    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(WITAI_TOK, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        if (output && '_text' in output && output._text.length)
            return output._text
        if (output && 'text' in output && output.text.length)
            return output.text
        return output;
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}

// Google Speech API
// https://cloud.google.com/docs/authentication/production
const gspeech = require('@google-cloud/speech');
const gspeechclient = new gspeech.SpeechClient({
  projectId: 'discordbot',
  keyFilename: 'gspeech_key.json'
});

async function transcribe_gspeech(buffer) {
  try {
      console.log('transcribe_gspeech')
      const bytes = buffer.toString('base64');
      const audio = {
        content: bytes,
      };
      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'en-US',  // https://cloud.google.com/speech-to-text/docs/languages
      };
      const request = {
        audio: audio,
        config: config,
      };

      const [response] = await gspeechclient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log(`gspeech: ${transcription}`);
      return transcription;

  } catch (e) { console.log('transcribe_gspeech 368:' + e) }
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
