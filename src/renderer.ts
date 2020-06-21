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

function test() {
    if (!validateForm()) {
        console.log('invalid form');
        console.log(leaguePath);
        console.log(replayPath);
        return;
    }
    if (fileNumber == files.length) {
        return;
    }    
    let regexp: RegExp =  /\-(.*?)\./;
    let matchId:string = regexp.exec(files[fileNumber])[1]
    console.log(matchId);
    fetch(`https://na1.api.riotgames.com/lol/match/v4/matches/${matchId}?api_key=RGAPI-1d0b3122-e8d1-42be-8216-7a1418321c93`)
    .then(response => {
        return response.json();
    })
    .then(match => {
        let array:Array<ParticipantIdentity> = match.participantIdentities;        
        let me:any = array.find(x => x.player.summonerName == 'jakeyizle');
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

        fetch(`https://na1.api.riotgames.com/lol/match/v4/timelines/by-match/${matchId}?api_key=RGAPI-1d0b3122-e8d1-42be-8216-7a1418321c93`)
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
            payload.summonerName = me.player.summonerName;
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
    test();
})
function getParticipant(name: any, match: any) {
    return match.filter(
        function(match: any){return match.summonerName == name }
    );
}



function setInstallPath() {
    document.getElementById('leaguePath').innerText = (<HTMLInputElement>document.getElementById('leagueInstallPath')).files[0].path
    leaguePath = (<HTMLInputElement>document.getElementById('leagueInstallPath')).files[0].path;
}
function setReplayPath() {
    document.getElementById('replayPath').innerText = (<HTMLInputElement>document.getElementById('leagueReplayPath')).files[0].path
    replayPath = document.getElementById('replayPath').innerText = (<HTMLInputElement>document.getElementById('leagueReplayPath')).files[0].path;
}
function clickFileDialog() {
    document.getElementById('leagueInstallPath').click();
}
function clickReplayDialog() {
    document.getElementById('leagueReplayPath').click();
}
function setLeagueConfig() {
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
    if ((<HTMLInputElement>document.getElementById('summonerName')).value.length == 0) {
        valid = false;
        console.log(document.getElementById('summonerName').innerText);
    }
    return valid;
}

function validateInstallPath() {
    if (!leaguePath) {
        return false;
    }
    return  (fs.existsSync(leaguePath + '\\Game\\League of Legends.exe') && fs.existsSync(leaguePath + '\\Game\\Data\\cfg\\game.cfg'));         
}

function validateReplayPath() {
    if (!replayPath) {
        return false;
    }
    return  fs.readdirSync(replayPath).length > 0;
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
}