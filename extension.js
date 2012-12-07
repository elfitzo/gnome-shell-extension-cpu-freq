const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;

//reads a file and trims it
function readFileAndTrim(fileName) {
    let file = Gio.file_new_for_path(fileName);
    return file.load_contents(null)[1].toString().trim();
}

function CpuFreq() {
    this._init.apply(this, arguments);
}

CpuFreq.prototype = {

    _init: function(){
        this.cpuFreqSelectorPath = this._locateCpuFreqSelector();
        if(!this.cpuFreqSelectorPath){
            throw "cpufreq-selector could not be found on your system.";
        }
        this.governors = this._getGovernors();
        this.numCpus = this._getNumCpus();
        this.availableFreqs = this._getAvailableFrequencies();
    },
    
    _locateCpuFreqSelector: function(){
        //detect if cpufreq-selector is installed
        let ret = GLib.spawn_command_line_sync("which cpufreq-selector");
        if ( (ret[0]) && (ret[3] == 0) ) {//if yes
            return ret[1].toString().split("\n", 1)[0];//find the path of cpufreq-selector
        }
        return null;
    },
    
    _getNumCpus: function(){
        let numCpus = 0;
        let out = GLib.spawn_command_line_sync("grep -c processor /proc/cpuinfo");
        if(out[0])
            numCpus = parseInt(out[1].toString().trim());
        return numCpus;
    },
    
    _getGovernors: function(){
        let governors=new Array();
        //get the list of available governors
        let cpufreq_output1 = readFileAndTrim("/sys/bus/cpu/devices/cpu0/cpufreq/scaling_available_governors");
        governors = cpufreq_output1.split(" ");
        
        return governors;
    },
    
    _getCurrentGovernor: function(){
        let i = 0;
        //get the actual governor
        let cpufreq_output2 = readFileAndTrim("/sys/bus/cpu/devices/cpu0/cpufreq/scaling_governor");
        let governorActual = cpufreq_output2;
        
        for each (let governor in this.governors){
            if(governorActual==governor)
                return i;
            i = i + 1;
        }
        
        return i;
    },
    
    _getCpuFreq: function(cpu){
        let freqInfo=null;
        let freqInfoInt=0;
        let cpufreq_output = readFileAndTrim("/sys/bus/cpu/devices/cpu"+ cpu + "/cpufreq/scaling_cur_freq");
        freqInfo = cpufreq_output;

        if (freqInfo)
            freqInfoInt = parseInt(freqInfo);
        
        return freqInfoInt;
    },
    
    _getCpuFreqs: function(){
        let cpuFreqs = Array(this.numCpus);
        for(let i = 0; i < this.numCpus; i++) {
            cpuFreqs[i] = this._getCpuFreq(i);
        }
        return cpuFreqs;
    },

    _getCpuFreqAvg: function(){
        let cpuFreqTotal = 0;
        for(let i = 0; i < this.numCpus; i++) {
            cpuFreqTotal = cpuFreqTotal + this._getCpuFreq(i);
        }
        return parseFloat(cpuFreqTotal) / parseFloat(this.numCpus);
    },
    
    _getCpuLimits: function(){
        let freqInfo= new Array(2);
        let freqInfoInt=0;

        let cpufreq_min_output = readFileAndTrim("/sys/bus/cpu/devices/cpu0/cpufreq/cpuinfo_min_freq");
        freqInfo[0] = cpufreq_min_output;
            
        let cpufreq_max_output = readFileAndTrim("/sys/bus/cpu/devices/cpu0/cpufreq/cpuinfo_max_freq");
        if(cpufreq_max_output[0])
            freqInfo[1] = cpufreq_max_output;
        
        if (freqInfo) {
            return [parseInt(freqInfo[0]), parseInt(freqInfo[1])];
        }
        return [0, 0]
    },

    _getCpuFreqPercent: function(){
        let cpuFreqTotal = 0;
        for(let i = 0; i < this.numCpus; i++) {
            cpuFreqTotal = cpuFreqTotal + this._getCpuFreq(i);
        }
        let cpuFreqAvg = parseFloat(cpuFreqTotal) / parseFloat(this.numCpus);
        let cpuLimits = this._getCpuLimits();
        return 100.0 * parseFloat(cpuFreqAvg) / parseFloat(cpuLimits[1]);
    },
    
    _getAvailableFrequencies: function(){
        let availableFreqs = Array();
        let out = readFileAndTrim('/sys/bus/cpu/devices/cpu0/cpufreq/scaling_available_frequencies');
        let availableFreqsStrings = out.split(' ');
        for each(let availableFreq in availableFreqsStrings) {
            let freq = parseInt(availableFreq);
            if(freq.toString() != 'NaN')
                availableFreqs.push(freq);
        }
        return availableFreqs;
    },

    _setCpuFreq: function(cpu, freq){
        let out = GLib.spawn_command_line_sync(this.cpuFreqSelectorPath + " -f " + freq + " -c " + cpu);
    },
    
    _setCpuFreqs: function(freq){
        for(let i = 0; i < this.numCpus; i++) {
            this._setCpuFreq(i, freq);
        }
    },

    _setCpuGov: function(cpu, gov){
        let out = GLib.spawn_command_line_sync(this.cpuFreqSelectorPath + " -g " + gov + " -c " + cpu);
    },
    
    _setCpuGovs: function(gov){
        for(let i = 0; i < this.numCpus; i++) {
            this._setCpuGov(i, gov);
        }
    },

    _human: function(freq){
        if(freq >= 10000000){
            freq = parseFloat(freq);
            return (freq / 1000000.0).toFixed(2) + " GHz";
        } else if(freq >= 10000){
            freq = parseFloat(freq);
            return (freq / 1000.0).toFixed(0) + " MHz";
        } else {
            return freq.toFixed(2) + " Hz";
        }
    }
}

function CpuFreqUi() {
    this._init.apply(this, arguments);
}

CpuFreqUi.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function(){
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'cpufreq');
        
        this.cpuFreq = new CpuFreq();
        
        this.statusLabel = new St.Label({
            text: "Hello",
            style_class: "cpufreq-label"
        });
        
        this._build_ui();
        //update every second
        this.event = Mainloop.timeout_add(2000, imports.lang.bind(this, function () {
            this._refresh_freq();
            this._refresh_popup();
            return true;
        }));
    },
    
    destroy: function(){
        Mainloop.source_remove(this.event);
        PanelMenu.SystemStatusButton.prototype.destroy.call(this);
        this.statusLabel.destroy();
        log(this);
    },

    _refresh_freq: function() {
        let freqInfo=this.cpuFreq._human(this.cpuFreq._getCpuFreqAvg());
        let text = "";
        if (freqInfo){
            text = freqInfo.toString();
        } else {
            text = "Frequency unknown";
        }
        
        if(this.statusLabel.text != text) {
            this.statusLabel.text = text;
            this.statusLabel.queue_redraw();
        }
    },
    
    _build_popup: function() {
        this.menu.removeAll();
    
        //get the available governors
        this.governorItems = Array();
        //build the popup menu
        if (this.cpuFreq.governors.length>0){
            let governorItem;
            for each (let governor in this.cpuFreq.governors){
                governorItem = new PopupMenu.PopupMenuItem("");
                let governorLabel=new St.Label({
                    text: governor,
                    style_class: "sm-label"
                });
                governorItem.addActor(governorLabel);
                this.governorItems.push(governorItem);
                this.menu.addMenuItem(governorItem);
                let g = governor.toString();
                governorItem.connect('activate', imports.lang.bind(this, function() {
                    this.cpuFreq._setCpuGovs(g);
                    this._refresh_popup();
                }));
            }
        }
        this._refresh_popup();
    },
    
    _refresh_popup: function() {
        let newGov = this.cpuFreq._getCurrentGovernor();
        for( let i = 0; i < this.governorItems.length; i++) {
            this.governorItems[i].setShowDot(false);
        }
        
        if (newGov < this.governorItems.length) {
           this.governorItems[newGov].setShowDot(true);
        }
    },
    
    _build_ui: function() {
        this.actor.get_children().forEach(function(c) {
            c.destroy()
        });
        
        this.actor.add_actor(this.statusLabel);
        this._refresh_freq();
        this._build_popup();
    }
}

function init() {
//do nothing
}

let indicator;

function enable() {
    indicator = new CpuFreqUi();
    Main.panel.addToStatusArea('cpufreq', indicator);
}

function disable() {
    indicator.destroy();
    indicator = null;
}
