import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
var fs = require('fs');
const find = require('find-process');
const fetch = require("node-fetch");
var AsyncPolling = require('async-polling');
var ks = require('node-key-sender');
const shell = require('node-powershell');
import {pullData, getRoles} from './role.js';

var child = new shell({
  executionPolicy: 'Bypass',
  noProfile: true
})

let mainWindow: Electron.BrowserWindow;


function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false
    },
    width: 800,
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "../index.html"));
  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on("closed", () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);
app.whenReady().then(() => {
  mainWindow.webContents.on('did-finish-load', () => {
  })
})
// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it"s common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

//need to think about the payload passed in here
//need the matchId (so we can find the replay)
//need the eventList (so we can find the events in the replay)
//need the role or position (so we can focus on the correct champion)
ipcMain.on('startReplay', (event,payload) => {  
  console.log("start");

  var path = "\"" + payload.leaguePath+"\\Game\\League of Legends.exe\" " + "\"" + payload.replayPath+ "\\NA1-"+payload.matchId+".rofl\"";
  console.log(payload.leaguePath);
  console.log(payload.replayPath);
  console.log(path);
  console.log('end');

  //need to start the league replay client while in the same folder otherwise it errors
  child.addCommand('cd \"' + payload.leaguePath+ '\\Game\"');
  child.addCommand('& ' + path);
  child.invoke().then((output: any) => {
    //console.log(output)
  });
  //yeah yeah i'll fix it
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  //keep hitting replay api until it gives 200
pollUntilDone(500, 30* 1000).then((result: any) =>{
  mainWindow.webContents.send('replay-loaded');
  //replay api will return 200 but the client is lagging, so need to wait a couple of seconds before sending the camera focus keys
  msleep(3*1000);
  fetch('https://127.0.0.1:2999/liveclientdata/playerlist').then((response: any) => {
    return response.json();
  }).then((responseJson: any) => {
    let playerPositions: PlayerPosition[] = responseJson;
    let playerPosition: PlayerPosition = playerPositions.find(x=>x.summonerName==payload.summonerName);

    //these need to be dynamic, based on role
    //only way to focus camera, the replay API does not support camera-focusing
    var hotkey = getCameraHotkey(playerPosition.position, playerPosition.team);    
    mainWindow.webContents.send('log-event', 'hotkey is: '+hotkey);    
    getClips(payload.leagueEventTimes, 0, hotkey).then((result:any) => {
      console.log("end of getclips!");
      //pretty sure league always uses port 2999. if not then this is fucked!
      find('port', 2999).then((list:any) => {      
      process.kill(list[0].pid);
      mainWindow.webContents.send('next-replay');
    })
    })
    })
  })
  
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
function delay(t: any) {
  return new Promise(function(resolve) {
    setTimeout(resolve, t);
  });
}

function pollUntilDone(interval: any, timeout: any) {
  let start = Date.now();
  function run() {
    console.log("run!");
    return fetch('https://127.0.0.1:2999/replay/playback').then((result: any) => {
      if (result.ok) {
        console.log("good!")
        result.json().then((jsonResult: any) => {
          if (jsonResult.time  == 0) {
            return delay(interval).then(run);
          }
          console.log(jsonResult.time);
        })
        
      } else {
        if (timeout !== 0 && Date.now() - start > timeout) {
          throw new Error("timeout error!");
        } else {          
          return delay(interval).then(run);
        }
      }
    }).catch((err: any) => {
      console.log("Error: " + err );
      if (timeout !== 0 && Date.now() - start > timeout) {
        throw new Error("timeout error!");
      }
      return delay(interval).then(run);
    })    
  }
  return run();
}

function msleep(n: any) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

function getClips(testEventArray: any, testIndex: any, hotkey:any) { 
  function test(eventArray:any, index:any) { 
    ks.sendKey(hotkey);
    ks.sendKey(hotkey);
    ks.sendKey(hotkey);  
  mainWindow.webContents.send('log-event', "start of index = " + index);
  var data = { startTime: eventArray[index].startTime, endTime: eventArray[index].endTime, recording: true};
  return fetch('https://127.0.0.1:2999/replay/recording', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)    
}).then((result:any) => {
  //after sending the recording call, the camera unlocks so we need to lock it again
  //but we cant do it immediately, because sometimes the client is still loading the new time
  mainWindow.webContents.send('log-event', 'before sleep');
  msleep(6*1000);
  //these need to be dynamic
  ks.sendKey(hotkey);
  ks.sendKey(hotkey);
  ks.sendKey(hotkey);  
  mainWindow.webContents.send('log-event', 'sent camera key: ' +hotkey);    
  mainWindow.webContents.send('log-event', ks);    
  console.log("before sleep at index = " + index);
  //this will need to be dynamic, based off the starttime/endtime
  msleep((eventArray[index].endTime - eventArray[index].startTime+2)*1000);
  if (index < eventArray.length-1) {
    mainWindow.webContents.send('log-event', "calling the next index at index = " + index)
    return test(eventArray, index+1);
  } else {
    mainWindow.webContents.send('log-event', "ending recursion at index = " + index);
    return;
  }

})
  }
  return test(testEventArray, testIndex);
}

//order == blue
//chaos == red

function getCameraHotkey(role: string, teamId: string) {
  let hotkey: string;
  role = role.toLowerCase();
  teamId = teamId.toLowerCase();
  if (role == 'top') {
    hotkey = '1';
    if (teamId == 'chaos') {
      hotkey = 'q';
    }    
  }
  if (role == 'jungle') {
    hotkey = '2';
    if (teamId == 'chaos') {
      hotkey = 'w';
    }    
  }
  if (role == 'middle') {
    hotkey = '3';
    if (teamId == 'chaos') {
      hotkey = 'e';
    }    
  }
  if (role == 'bottom') {
    hotkey = '4';
    if (teamId == 'chaos') {
      hotkey = 'r';
    }    
  }
  if (role == 'utility') {
    hotkey = '5';
    if (teamId == 'chaos') {
      hotkey = 't';
    }    
  }
  return hotkey;
}


interface PlayerPosition {
  position: string;
  summonerName: string;
  team: string;
}
