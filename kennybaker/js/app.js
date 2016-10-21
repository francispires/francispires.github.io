var video = $('video');

function handleStart(e) {
    console.log(e)
}

function handleEnd(e) {
    console.log(e)
}

function handleMove(e) {
    console.log(e)
}

function handleCancel(e) {
    console.log(e)
}
$(window).resize(function() {
    UpdateJoyPosition()
});

function UpdateJoyPosition() {
    $("#videoOverlayLeft").height($('video').height() / 2)
    $("#videoOverlayLeft").width($('video').width() / 2)
    $("#videoOverlayRight").height($('video').height() / 2)
    $("#videoOverlayRight").width($('video').width() / 2)

    $("#videoOverlayDown").height($('video').height() / 2)
    $("#videoOverlayDown").width($('video').width())

    $("#videoOverlayLeft").position({
        my: "left top",
        at: "center top",
        of: "video"
    });
    $("#videoOverlayLeft").css('left', '0')

    $("#videoOverlayRight").position({
        my: "left top",
        at: "center top",
        of: "video"
    });
    $("#videoOverlayRight").css('left', '50%')
    $("#videoOverlayDown").position({
        my: "center bottom",
        at: "center bottom",
        of: "video"
    });
    $("#videoOverlayDown").css('top', $('video').height() / -2 + 'px')
    $("#joystick").position({
        my: "left bottom",
        at: "left bottom",
        of: "video"
    });
    $('.d0').position({
        my: "left top",
        at: "left top",
        of: "#videoOverlayLeft"
    })
    $('.d1').position({
        my: "right top",
        at: "right top",
        of: "#videoOverlayRight"
    })
    $('.d2').position({
        my: "center bottom",
        at: "center bottom",
        of: "#videoOverlayDown"
    })
}


// WebRTC
var video_out = document.getElementById("vid-box");
var userId = "";
var standby_suffix = "-stdby";

function login(form) {
    userId = 'Controlador';
    var userIdStdBy = userId + standby_suffix;
    var pubnub = window.pubnub = PUBNUB({
        publish_key: 'pub-c-2c8845c6-5589-42de-8edf-c2707c226af8',
        subscribe_key: 'sub-c-2c464a2c-6736-11e6-9196-0619f8945a4f',
        uuid: userId
    });
    pubnub.subscribe({
        channel: userIdStdBy,
        message: incomingCall,
        connect: function(e) {
            pubnub.state({
                channel: userIdStdBy,
                uuid: userId,
                state: {
                    "status": "Available"
                },
                callback: function(m) {
                    console.log(JSON.stringify(m))
                    makeCall($('#call')[0]);
                }
            });
            console.log("Sinalização completa!");
        }
    });
    return false;
}

function incomingCall(m) {
    video_out.innerHTML = "Conectando...";
    setTimeout(function() {
        if (!window.phone) phoneStart();
        phone.dial(m["call_user"]);
    }, 2000);
}

function makeCall(form) {
    if (!window.pubnub) alert("Primeiro entre!");
    //Publica para o canal de espera.
    var callUser = 'KennyBaker';
    var stdByCh = callUser + standby_suffix;
    var msg = {
        "call_user": userId,
        "call_time": new Date().getMilliseconds()
    };
    console.log("HERE" + callUser + stdByCh);
    window.pubnub.publish({
        channel: stdByCh,
        message: msg,
        callback: function(m) {
            console.log(m);
        }
    });
    if (!window.phone) phoneStart();
    // 	window.phone.dial(callUser);
    return false;
}

function phoneStart() {
    var phone = window.phone = PHONE({
        number: 'Controlador',
        publish_key: 'pub-c-2c8845c6-5589-42de-8edf-c2707c226af8',
        subscribe_key: 'sub-c-2c464a2c-6736-11e6-9196-0619f8945a4f',
        ssl: true
    });

    phone.ready(function() {
        console.log("Tudo certo!");
    });
    phone.receive(function(session) {
        session.message(message);
        session.connected(function(session) {
            //video_out.innerHTML = "";
            video_out.appendChild(session.video);
            setInterval(function () {
            UpdateJoyPosition()    
            },500)
        });
        session.ended(function(session) {
            video_out.innerHTML = '';
        });
    });
    window.phone = phone;
}

function end() {
    if (window.phone) window.phone.hangup();
}

function sendMessage(value) {
    phone.send({
        text: value,
        msg_message: value,
        msg_uuid: 'Controlador',
        msg_timestamp: new Date().getTime()
    });
    console.log(value)
}

function formatTime(millis) {
    var d = new Date(millis);
    var h = d.getHours();
    var m = d.getMinutes();
    var s = d.getSeconds();
    var a = (Math.floor(h / 12) === 0) ? "am" : "pm";
    return (h % 12) + ":" + m + "." + s + " " + a;
}
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=->
// Proteção XSS
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=->
function safetxt(text) {
    return ('' + text).replace(/[<>]/g, '');
}

function rangeSensor0(v) {
    $('.d0').text(v);
    var newValue = 260 - v - 360;
    $('#videoOverlayLeft').css({
        'box-shadow': 'inset 130px 130px 280px ' + newValue + 'px #F22D0E',
        '-webkit-box-shadow': 'inset 130px 130px 280px ' + newValue + 'px #F22D0E',
        '-moz-box-shadow': 'inset 130px 130px 280px ' + newValue + 'px #F22D0E',
        '-o-box-shadow': 'inset 130px 130px 280px ' + newValue + 'px #F22D0E'
    });
}

function rangeSensor1(v) {
    $('.d1').text(v);
    var newValue = 260 - v - 360;
    $('#videoOverlayRight').css({
        'box-shadow': 'inset -130px 130px 280px ' + newValue + 'px #F22D0E',
        '-webkit-box-shadow': 'inset -130px 130px 280px ' + newValue + 'px #F22D0E',
        '-moz-box-shadow': 'inset -130px 130px 280px ' + newValue + 'px #F22D0E',
        '-o-box-shadow': 'inset -130px 130px 280px ' + newValue + 'px #F22D0E'
    });
}

function rangeSensor2(v) {
    $('.d2').text(v);
    var newValue = 260 - v - 360;
    $('#videoOverlayDown').css({
        'box-shadow': 'inset 0px -200px 300px ' + newValue + 'px #F20E0E',
        '-webkit-box-shadow': 'inset 0px -200px 300px ' + newValue + 'px #F20E0E',
        '-moz-box-shadow': 'inset 0px -200px 300px ' + newValue + 'px #F20E0E',
        '-o-box-shadow': 'inset 0px -200px 300px ' + newValue + 'px #F20E0E'
    });
}

function message(session, message) {
    //console.log(message);
    rangeSensor0(JSON.parse(message.msg_message).d0);
    rangeSensor1(JSON.parse(message.msg_message).d1);
    rangeSensor2(JSON.parse(message.msg_message).d2);
}
// setInterval(function() {

//     var d0 = Math.floor(Math.random() * (200 - 0)) + 5;

//     var d1 = Math.floor(Math.random() * (200 - 0)) + 5;

//     var d2 = Math.floor(Math.random() * (200 - 0)) + 5;

//     message(null, {
//         "d0": d0,
//         "d1": d1,
//         "d2": d2
//     });
// }, 1000)
login($('#login')[0]);
