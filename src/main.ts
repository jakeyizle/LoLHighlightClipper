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
    var files = fs.readdirSync(app.getPath('home')+'/Documents/League of Legends/Replays');
    mainWindow.webContents.send('dir-name', files)
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
  var pythonChild =  new shell({
    executionPolicy: 'Bypass',
    noProfile: true
  })
  pythonChild.addCommand('cd "D:\\Coding Projects\\LeagueReplay2\\main"');
  pythonChild.addCommand('& .\\main.exe "'+payload.matchId+'"');
  pythonChild.invoke().then((pyoutput: any) => {
    console.log("PY INVOKED!");
    console.log(pyoutput);    
  console.log(payload.matchId);
  var path = "\"D:\\Games\\League of Legends\\Game\\League of Legends.exe\" \"C:\\Users\\Jakertle\\Documents\\League of Legends\\Replays\\NA1-"+payload.matchId+".rofl\""
  //console.log(path);

  //need to start the league replay client while in the same folder otherwise it errors
  child.addCommand('cd \"D:/Games/League of Legends/Game\"');
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
  //these need to be dynamic, based on role
  //only way to focus camera, the replay API does not support camera-focusing
  ks.sendKey('4');
  ks.sendKey('4');
  ks.sendKey('4');  

  getClips(payload.leagueEventTimes, 0).then((result:any) => {
    console.log("end of getclips!");
    //pretty sure league always uses port 2999. if not then this is fucked!
    find('port', 2999).then((list:any) => {      
    process.kill(list[0].pid);
    mainWindow.webContents.send('next-replay');
  })
  })
  })

}).catch((err: any) => {
  let regexp: RegExp =  /\{(.*?)\}/;
  let positions:string = regexp.exec(err)[0]  
  for (let i = 1; i < 11; i++) {
    positions = positions.replace(i.toString(), '"'+i.toString()+'"');
  }
  let newRegExp: RegExp = /(')/g;
  positions = positions.replace(newRegExp, '"');
  console.log(JSON.parse(positions));
  let jsonPos = JSON.parse(positions)
  let test = '1';
  console.log(jsonPos['1']);
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

function getClips(testEventArray: any, testIndex: any) { 
  function test(eventArray:any, index:any) { 
  console.log("start of index = " + index);
  var data = { startTime: eventArray[index].startTime, endTime: eventArray[index].endTime, recording: true};
  return fetch('https://127.0.0.1:2999/replay/recording', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)    
}).then((result:any) => {
  //after sending the recording call, the camera unlocks so we need to lock it again
  //but we cant do it immediately, because sometimes the client is still loading the new time
  msleep(3*1000);
  //these need to be dynamic
  ks.sendKey('4');
  ks.sendKey('4');
  ks.sendKey('4');  
  console.log("before sleep at index = " + index);
  //this will need to be dynamic, based off the starttime/endtime
  msleep((eventArray[index].endTime - eventArray[index].startTime+2)*1000);
  if (index < eventArray.length-1) {
    console.log("calling the next index at index = " + index)
    return test(eventArray, index+1);
  } else {
    console.log("ending recursion at index = " + index);
    return;
  }

})
  }
  return test(testEventArray, testIndex);
}