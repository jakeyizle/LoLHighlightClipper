// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const homedir = require('os').homedir();

const fsPre = require('electron').remote.require('fs')

window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element) {
      (<HTMLInputElement>element).value = text;
    }
  };
  if (initalizeLeaguePath()) {
    document.getElementById('leaguePath').innerText = initalizeLeaguePath();
  }
  if (initalizeReplayPath()) {
    document.getElementById('replayPath').innerText = initalizeReplayPath();
  }
});

function initalizeLeaguePath() {
  if (store.get('leagueInstallPath')) {    
    return store.get('leagueInstallPath')
  }
  let possibleFilePaths = ['C:\\Program Files\\League of Legends', 'C:\\Program Files(x86)\\League of Legends', 'D:\\Program Files\\League of Legends', 'D:\\Program Files(x86)\\League of Legends']
  possibleFilePaths.forEach(filePath => {
    if(fsPre.existsSync(filePath+'/Game/League of Legends.exe')) {
      return filePath;
    }
  });  
}

function initalizeReplayPath() {
  if (store.get('leagueReplayPath')) {
    console.log(store.get('leagueReplayPath'));
    return store.get('leagueReplayPath');
  }
  if (fsPre.existsSync(homedir+'\\Documents\\League of Legends\\Replays')) {
    return homedir+'\\Documents\\League of Legends\\Replays';
  }
}