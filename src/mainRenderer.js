const fs = require ('fs');
const { ipcRenderer } = require('electron');
const db = require('./database');
const { exec } = require("child_process");

const BootstrapVue = require('bootstrap-vue').default;

var dolphinPath = "C:\\Users\\18135\\AppData\\Roaming\\Slippi Desktop App\\dolphin\\Dolphin.exe"
var isoPath = "D:\\Games\\Dolphin Isos\\Super Smash Bros. Melee (USA) (En,Ja) (Rev 2).nkit.iso"
var replayCommand = `"${dolphinPath}" -i tempMoments.json -b -e "${isoPath}"`;
var config;

Vue.config.devtools = true;
Vue.use(BootstrapVue);

document.addEventListener("DOMContentLoaded", async function() {
  config = await db.getAll('configuration');
})



//routes replies from workers
ipcRenderer.on('reply', async(event, message) => {
  console.log('reply!');
  console.log(message);
  let {name, args} = message;    
  console.log(this[name]);
  if (this[name]) {
      this[name](args);
  } else {
      console.log("no function found");
  }
});

const vm = new Vue({
  el: '#app',
  data: {
    currentCount: 0,
    conversions: '',
    currentPage: 1,
    perPage: 20,
    selectedRows: [],
    attackingPlayer: '',
    minimumDamageDone: '',
    didKill: '',
    minimumMoveCount: '',
    fields: [
      {
        key: 'attackingPlayer',
        sortable: true
      },
      {
        key: 'attackingCharacter',
        sortable: true
      },
      {
        key: 'defendingPlayer',
        sortable: true
      },
      {
        key: 'defendingCharacter',
        sortable: true
      },
      {
        key: 'stage',
        sortable: true
      },
      {
        key: 'percent',
        sortable: true
      },
      {
        key: 'didKill',
        sortable: true
      },
      {
        key: 'moves.length',
        label: 'Move Count',
        sortable: true
      },      
      {
        key:'time',
        sortable: true
      },
      'Button',
      {
        key: 'vote',
        sortable: true
      }
    ],
  },
  methods: {
    getConversionsFromDatabase: async function () {
      let conversions = await db.getAll('conversions');
      if (this.attackingPlayer) {
        conversions = conversions.filter(x => x.attackingPlayer == this.attackingPlayer);
        console.log('filtering by attackingPlayer');
      }
      if (this.minimumDamageDone) {        
        conversions = conversions.filter(x => parseFloat(x.percent) >= parseFloat(this.minimumDamageDone));
        console.log('filtering by minimumDamageDone');
      }
      if (this.didKill) {
        conversions = conversions.filter(x => x.didKill == this.didKill);
        console.log('filtering by didKill');
      }
      if (this.minimumMoveCount) {
        conversions = conversions.filter(x => x.moves.length >= this.minimumMoveCount);
        console.log('filtering by minimumMoveCount');
      }
      console.log(this.conversions);
      this.conversions = conversions;
    },
    play: function(item) {
      var output = {
        "mode": "queue",
        "replay": "",
        "isRealTimeMode": false,
        "outputOverlayFiles": true,
        "queue": []
        };
        var queueMessage = {
          "path":item.filePath,
          "startFrame": item.startFrame,
          "endFrame": item.endFrame
        };
        output.queue.push(queueMessage);
        fs.writeFileSync("tempMoments.json", JSON.stringify(output));
        console.log(output);
        exec(replayCommand, (error) => {
          //dolphin will exit, and then the command will error
          //then this fires - so this is how we time it (since opening a million dolphins doesnt work so well)
          if (error) {
              console.log(`error - but actually good!`);                               
              return;
          }
      })
    },
    test: function(item) {
      console.log(item);
    },
    updateConversion: async function(item) {
      let foo = await db.updateRow('conversions', {id: item.id}, item);    
      console.log(foo);      
    }
  },
  computed: {
    rows() {
      return this.conversions.length
    },
    selectedRows() {
      return this.conversions.filter(item => item.selected)
    }
  }
})



async function startDatabaseLoading() {
  await ipcRenderer.invoke('execute', {
    name: 'startDatabaseLoading'
  });
}

function startingDatabaseLoad(obj) {
  console.log(obj);
  vm.maxCount = obj.fileCount;
}

function fileLoaded(obj) {
  console.log(obj);
  vm.currentCount = obj.fileNumber;
}


async function insertReplayPath(filePath) {
    let results = await db.updateRow('configuration', {configId: 'replayPath'}, {'value': filePath});
    console.log(results);
    return results;
}


//get all files in all subdirectories
async function getFiles(path = "./") {
    const entries = fs.readdirSync(path, { withFileTypes: true });
    // Get files within the current directory and add a path key to the file objects
    const files = entries
        .filter(file => !file.isDirectory())
        .map(file => ({ ...file, path: path + file.name }));
  
    // Get folders within the current directory
    const folders = entries.filter(folder => folder.isDirectory());
  
    for (const folder of folders)
        /*
          Add the found files within the subdirectory to the files array by calling the
          current function itself
        */
        files.push(...await getFiles(`${path}${folder.name}/`));
  
    return files;
  }