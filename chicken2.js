var fs = require('fs');
var osc = require('node-osc');
var arDrone = require('ar-drone');
var keypress = require('keypress');


Game = function(droneClient, oscClient, oscServer) {

    var that = this;

    this.droneClient = droneClient;
    this.oscClient = oscClient;
    this.oscServer = oscServer;

    this.running = false;
    this.updateHandle = null;
    this.initpos = { };
    this.curpos = { };
    this.flaps  = { re: [], le: [] };

    this.battery = false;
    this.maxtime = 0;
    this.elapsedtime = 0;
    this.state = '';
    this.hstate = ''

    this.warnbattery = function () {
        if (!that.battery) {
            that.battery = true;
            console.warn('low battery baby');
            setTimeout(function() { that.battery = false; }, 10000);
        }
    }

    this.landdrone = function() {
        console.log("landing baby");
        clearInterval(that.updateHandle);
        that.droneClient.land(); 
        that.droneClient.disableEmergency();
        that.running = false;
        console.log('Your score: ', that.elapsedtime);
    };

    this.dronetakeoff = function() {
        console.log("take off baby", that.running);
        if(!that.running) {
            that.droneClient.disableEmergency();
            that.droneClient.takeoff();
            that.droneClient.stop();
            that.state = '';
            that.hstate = '';
            setTimeout(that.drone_init_done, 6000);
        }
    };

    this.updown = function(msg) {
        if(msg === 'up') {
            return 'up';
        } else if(msg === 'down') {
            return 'down';
        }
        return 'other';
    };

    this.run = function() {

        that.droneClient.config('general:navdata_demo', 'FALSE');

        that.oscServer.on("message", function (msg, rinfo) {
            var updown = 0;
            for(i=1; i < msg.length; i++) { 
                if(msg[i][0] === '/tracking_skeleton' && msg[i][1] === 1) {

                   that.dronetakeoff();

                } else if(msg[i][0] === '/tracking_skeleton' && msg[i][1] === 0) {

                    that.landdrone();

                } else if(that.running && msg[i][0] === '/rightelbow') {
                     
                    updown = that.updown(msg[i][1]);
                    that.flaps['re'].push(updown);

                } else if(that.running && msg[i][0] === '/leftelbow') {
                    updown = that.updown(msg[i][1]);
                    that.flaps['le'].push(updown);
                }
            }
        });

        keypress(process.stdin);
        process.stdin.on('keypress', function (ch, key) {
            //console.log('got "keypress"', key);
            if (key && key.ctrl && key.name == 'c') {
                that.landdrone()
                process.exit();
            }
            if (key && key.name == 'l') {
                that.landdrone()
            }
            if (key && key.name == 't') {
                that.dronetakeoff()
            }
            if (key && key.name == 'left') {
                that.droneClient.left(1.0);
                setTimeout(function() { that.droneClient.left(0.0); }, 250);
            }
            if (key && key.name == 'right') {
                that.droneClient.right(1.0);
                setTimeout(function() { that.droneClient.right(0.0); }, 250);
            }
            if (key && key.name == 'up') {
                that.droneClient.front(1.0);
                setTimeout(function() { that.droneClient.front(0.0); }, 250);
            }
            if (key && key.name == 'down') {
                that.droneClient.back(1.0);
                setTimeout(function() { that.droneClient.back(0.0); }, 250);
            }
        });
        process.stdin.setRawMode(true);
        process.stdin.resume();

        fs.writeFile('/tmp/navdata.txt', '', function(err) { });
        that.droneClient.on('navdata', function(ev) {
            if(that.running) {
                fs.appendFile('/tmp/navdata.txt', JSON.stringify(ev, null, '\t'), function(err) { });
            }
            if(ev['droneState']['lowBattery'] === 1) {
                that.warnbattery();
            }
            if(ev['demo'] != undefined)
                if(ev['demo']['altitudeMeters'] != undefined) {
                    var refalt = ev['demo']['altitudeMeters'];
                    if(refalt <= 0.15 && that.running) {
                        console.log(refalt, 'dropped to min')
                        that.landdrone();
                    }
                }
        });
    };

    this.validflap = function(values) {
        if(values.length < 2) {
            return [false, 0];
        }

        var numvals = { 'other':0, 'down':0, 'up':0 };
        for(i=0; i < values.length; i++) {
            numvals[values[i]] += 1;
        }

        var diff = Math.abs(numvals['up'] - numvals['down']);

        return [diff <= 3, numvals['down']]; 
    };

    this.gravity = function() {
        if(that.state != 'down') {
            console.log('gravity');
            that.droneClient.down(0.1);
            that.state = 'down';
        }
    };

    this.updategame = function() {
        var flapdiff = Math.abs(that.flaps['re'].length - that.flaps['le'].length);

        that.elapsedtime += 1;

        if(that.elapsedtime > that.maxtime) {
            if(that.hstate != 'cw') { that.droneClient.animate('wave', 2000); that.hstate = 'cw'; }
            that.maxtime = that.elapsedtime;
        }

        if(flapdiff <= 3) {
            var rstat = that.validflap(that.flaps['re']);
            var lstat = that.validflap(that.flaps['le']);

            console.log(lstat, rstat);

            if(rstat[0] && lstat[0]) {
                if(rstat[1] > 2 || lstat[1] > 2) {
                    console.log('up');
                    if(that.state != 'up') { that.droneClient.up(1.0); that.state = 'up'; }
                    setTimeout(function() { console.log("jump done"); that.droneClient.down(0.1); that.state = 'down'; }, 750);
                } else if(rstat[1] === 2 || lstat[1] === 2) {
                    if(Math.random() <= 0.50) {
                        console.log('up');
                        if(that.state != 'up') { that.droneClient.up(1.0); that.state = 'up'; }
                        setTimeout(function() { console.log("jump done"); that.droneClient.down(0.1); that.state = 'down'; }, 750);
                    } else {
                        console.log('stable');
                        if(that.state != 'stop') { that.droneClient.down(0.0); that.state = 'stop'; }
                    }
                } else if(rstat[1] === 1 || lstat[1] === 1) {
                    if(Math.random() <= 0.5) {
                        if(that.state != 'stop') { that.droneClient.down(0.0); that.state = 'stop'; }
                    } else {
                        that.gravity();
                    }
                } else if(rstat[1] < 1 || lstat[1] < 1) {
                    that.gravity();
                }
            } else {
                that.gravity();
            }
        } else {
            that.gravity();
        }

        that.flaps['re'] = [];
        that.flaps['le'] = [];
    };

    this.drone_init_done = function() {
        console.log('initializing');
        that.updateHandle = setInterval(that.updategame, 1000);
        that.gravity();
        that.running = true;
        that.elapsedtime = 0;
    };
};

var droneClient = arDrone.createClient();
var oscServer   = new osc.Server(12347, '0.0.0.0');
var oscClient   = new osc.Client('127.0.0.1', 12346);

var game = new Game(droneClient, oscClient, oscServer);
game.run();

