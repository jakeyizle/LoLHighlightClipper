// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const { ipcRenderer } = require('electron')
const {dialog} = require('electron').remote;
const fs = require('electron').remote.require('fs')
const Store = require('electron-store');
const store = new Store();

var files: any;
var fileNumber: number = 0;
var leaguePath: string;
var replayPath: string;
var summonerName: string;
var apiKey = 'RGAPI-d0a5ffda-1044-43a5-b325-35f4d52c4e09';

function startReplayProcess() {
    leaguePath = document.getElementById('leaguePath').innerText;    
    replayPath = document.getElementById('replayPath').innerText;
    summonerName = (<HTMLInputElement>document.getElementById('summonerName')).value;
    if (!validateForm()) {
        console.log('invalid form');
        console.log(leaguePath);
        console.log(replayPath);
        console.log(summonerName);        
        return;
    }
    files = fs.readdirSync(replayPath);
    setLeagueConfig();
    storePaths();
    getMatchAndStartLeague();
}

function getMatchAndStartLeague() {
    console.log(summonerName);
    if (fileNumber == files.length) {
        return;
    }    
    let regexp: RegExp =  /\-(.*?)\./;
    let matchId:string = regexp.exec(files[fileNumber])[1]
    console.log(matchId);
    fetch(`https://na1.api.riotgames.com/lol/match/v4/matches/${matchId}?api_key=${apiKey}`)
    .then(response => {
        return response.json();
    })
    .then(match => {
        let array:Array<ParticipantIdentity> = match.participantIdentities;        
        let me:any = array.find(x => x.player.summonerName == summonerName);
        console.log(me);
        let participantId = me.participantId;
        
        let participantArray:Array<any> = match.participants;        
        let teamId = participantArray.find(x=> x.participantId == participantId).teamId;
        let teamArray:Array<any> = participantArray.filter(x=>x.teamId == teamId);
        let champions:Array<number> = new Array();
        let userChampion: number;
        for (let i = 0; i < teamArray.length; i++) {
            champions.push(teamArray[i].championId);
            if (teamArray[i].participantId == participantId) {
                userChampion = teamArray[i].championId;
            }            
        }        
        console.log("teamId: " +teamId);
        console.log(champions);

        fetch(`https://na1.api.riotgames.com/lol/match/v4/timelines/by-match/${matchId}?api_key=${apiKey}`)
        .then(result => {
            return result.json();
        })
        .then(timeline => {
            console.log(timeline);
            let eventArray: Array<LeagueEvent> = new Array();
            for (let i = 0; i < timeline.frames.length; i++) {
                for (let j = 0; j < timeline.frames[i].events.length; j++) {
                    if (timeline.frames[i].events[j].type == 'CHAMPION_KILL') {                        
                        eventArray.push(timeline.frames[i].events[j]);
                    }
                }
            }
            eventArray = eventArray.filter(x=> x.killerId == participantId);
            let timeEventArray: Array<LeagueEventTime> = new Array();

            eventArray.forEach(element => {
                let time: LeagueEventTime = new LeagueEventTime();
                time.startTime = Math.max(0, element.timestamp/1000 - 15);
                time.endTime = element.timestamp/1000 + 15
                time.timestamp = element.timestamp;
                timeEventArray.push(time);    
            });
            let i = 0;
            //if 2 events would overlap, we combine them
            while(i < timeEventArray.length-1) {
                timeEventArray.sort((a,b)=> (a.startTime, b.startTime) ? 1: -1);
                if (timeEventArray[i].endTime >= timeEventArray[i+1].startTime) {
                    timeEventArray[i].endTime = timeEventArray[i+1].endTime;
                    timeEventArray.splice(i+1,1);                    
                } else { 
                    i++;
                }
            }
            console.log(timeEventArray);
            let payload: Payload = new Payload();
            payload.leagueEventTimes = timeEventArray;
            payload.matchId = matchId
            payload.teamId = teamId;
            payload.championIds = champions;
            payload.summonerName = summonerName;
            payload.leaguePath = leaguePath;
            payload.replayPath = replayPath;
            console.log(payload)
            ipcRenderer.send('startReplay', payload);
        })
    })    
    fileNumber++;
    console.log('next filenumber is: '+fileNumber);
}

ipcRenderer.on('dir-name', (event, payload) => {
        files = payload;
})

ipcRenderer.on('replay-loaded', (event, payload) => {
    console.log('replay loaded!');
})
ipcRenderer.on('next-replay', (event, payload) => {
    getMatchAndStartLeague();
})
ipcRenderer.on('log-event', (event, payload) => {
    console.log(payload);
})
function getParticipant(name: any, match: any) {
    return match.filter(
        function(match: any){return match.summonerName == name }
    );
}



function setInstallPath() {
    document.getElementById('leaguePath').innerText = (<HTMLInputElement>document.getElementById('leagueInstallPath')).files[0].path
}

function setReplayPath() {
    document.getElementById('replayPath').innerText = (<HTMLInputElement>document.getElementById('leagueReplayPath')).files[0].path
}

function clickFileDialog() {
    document.getElementById('leagueInstallPath').click();
}

function clickReplayDialog() {
    document.getElementById('leagueReplayPath').click();
}

function setLeagueConfig() {
    if (!fs.existsSync(leaguePath + '\\Game\\Data\\cfg\\game.cfg')) {
        if (!fs.existsSync(leaguePath + '\\Game\\Data\\cfg')) {
            fs.mkdirSync(leaguePath + '\\Game\\Data\\cfg');
            console.log("copied directory");
        }
        fs.copyFileSync(leaguePath+'\\Config\\game.cfg', leaguePath+'\\Game\\Data\\cfg\\game.cfg');
        console.log("copied file");
    }
    var config:string = fs.readFileSync(leaguePath+'\\Game\\Data\\cfg\\game.cfg', 'utf8');
    if (config.indexOf('EnableReplayApi=1') === -1) {
        var newConfig = config.slice(0, 15) + 'EnableReplayApi=1\n' + config.slice(15);
        fs.writeFileSync(leaguePath+'\\Game\\Data\\cfg\\game.cfg', newConfig);
    }    
}

function validateForm() {
    let valid = true;
    if (!validateInstallPath()) {
        valid = false;
    }
    if (!validateReplayPath()) {
        valid = false;
    }
    if (summonerName.length == 0) {
        valid = false;
        console.log(document.getElementById('summonerName').innerText);
    }    
    return valid;
}

function validateInstallPath() {
    if (!leaguePath) {
        return false;
    }
    return (fs.existsSync(leaguePath + '\\Game\\League of Legends.exe'));         
}

function validateReplayPath() {
    if (!replayPath) {
        return false;
    }
    return fs.readdirSync(replayPath).length > 0;
}

function storePaths() {
    store.set('leagueInstallPath', leaguePath);
    store.set('leagueReplayPath', replayPath);
}

interface Player {
    platformId: string;
    accountId: string;
    summonerName: string;
    summonerId: string;
    currentPlatformId: string;
    currentAccountId: string;
    matchHistoryUri: string;
    profileIcon: number;
}

interface ParticipantIdentity {
    participantId: number;
    player: Player;
}


interface Position {
    x: number;
    y: number;
}

interface LeagueEvent {
    type: string;
    timestamp: number;
    position: Position;
    killerId: number;
    victimId: number;
    assistingParticipantIds: any[];
}

class LeagueEventTime {
    startTime: number;
    endTime: number;
    timestamp: number;
}

class Payload{
    leagueEventTimes: LeagueEventTime[];    
    matchId: string;
    championIds: number[];
    summonerName: string;
    teamId: number;
    leaguePath: string;
    replayPath: string;
}