var osc = require('node-osc');
var arDrone = require('ar-drone');


Game = function(droneClient, oscClient, oscServer) {

    var that = this;

    this.droneClient = droneClient;
    this.oscClient = oscClient;
    this.oscServer = oscServer;

    this.running = false;
    this.updateHandle = null;
    this.initpos = { };
    this.curpos = { };

    this.landdrone = function() {
        console.log("landing baby");
        clearInterval(that.updateHandle);
        that.droneClient.land(); 
        that.running = false;
    };

    this.dronetakeoff = function() {
        if(!that.running) {
            console.log("take off baby");
            that.droneClient.disableEmergency();
            that.droneClient.takeoff();
            that.droneClient.stop();
            that.running = true;
            setTimeout(that.drone_init_done, 7000);
        }
    };

    this.run = function() {

        setInterval(function() {
            that.oscClient.send('/righthand_trackjointpos', 3);
        }, 2000);

        that.droneClient.config('general:navdata_demo', 'FALSE');
        that.droneClient.on('navdata', function(ev) { 
            // on low battery call landdrone    
        });

        that.oscServer.on("message", function (msg, rinfo) {
            for(i=1; i < msg.length; i++) { 
                if(msg[i][0] === '/lefthand' && msg[i][1] === 'up') {

                    that.dronetakeoff();

                } else if(msg[i][0] === '/leftelbow' && msg[i][1] === 'down') {

                    that.landdrone();

                } else if(msg[i][0] === '/righthand_pos_screen') {
                    that.curpos['rh'] = msg[i].splice(1, 3);
                }
            }
        });
    };

    this.dronerunning = function() {
        var xoff = that.curpos['rh'][0] - that.initpos['rh'][0];
        var yoff = that.curpos['rh'][1] - that.initpos['rh'][1];
        var zoff = that.curpos['rh'][2] - that.initpos['rh'][2];

        if(xoff > 10.0) { 
            that.droneClient.right(0.2);
        } else if(xoff < -10.0) {
            that.droneClient.left(0.2);
        } else {
            that.droneClient.left(0.0);
        }

        if(yoff < -10.0) {
            that.droneClient.up(0.5);
        } else if(yoff > 10.0) {
            that.droneClient.down(0.5);
        } else {
            that.droneClient.up(0.0);
        }
    };

    this.drone_init_done = function() {
        console.log('initializing');
        that.initpos['rh'] = that.curpos['rh'].splice(0, 3);
        that.updateHandle = setInterval(that.dronerunning, 100);
    };
};

var droneClient = arDrone.createClient();
var oscServer   = new osc.Server(12347, '0.0.0.0');
var oscClient   = new osc.Client('127.0.0.1', 12346);

var game = new Game(droneClient, oscClient, oscServer);
game.run();

