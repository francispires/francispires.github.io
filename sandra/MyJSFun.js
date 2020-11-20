var ajaxUrl = 'http://localhost/NEAD/';

function saveData(d) {
    d.a = "save";
    $.ajax({
        url: ajaxUrl + 'mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).done(function() {}).fail(function() {}).always(function() {});
}

function Sync() {
    alert('obsolete')
}

function getData() {
    var p = GetPlayer();
    var v = p.GetVar(key);
    //var u = lmsAPI.GetStudentID();
    var u = '1';
    loadData({
        u: u
    });
    var s1pag = 4;
}

function getName() {
    var player = GetPlayer();
    var myName = window.top.userlogin;
    var array = myName.split(',');
    var newName = array[1] + ' ' + array[0];
    player.SetVar("username", newName);
}
var finalAnswers = [
    ["141", "101", "141", "101", "141", "093"], // Módulo 1
    ["", "", "", "", "", ""], // Módulo 2 -- Not Done
    ["", "", "", "", "", ""] // Módulo 3 -- Not Done
];

function Data(key) {
    var p = GetPlayer();
    var v = p.GetVar(key);
    var u = window.top.userlogin;
    saveData({
        k: key,
        v: v,
        u: u
    });
}
var visitedPages = [
    [ // Modulo 1
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        []
    ],
    [ // Modulo 2
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        []
    ],
    [ // Modulo 3
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        []
    ]
]

function Paginate(p) {
    var pl = window.top.player;
    var m = pl.GetVar("moduloAtual"); //    1
    var s = pl.GetVar("scenceAtual"); //    2
    if (String(p).length == 1) {
        p = "0" + String(p);
    };
    var slideTogo = String(String(m) + String(s) + String(p));
    pl.SetVar("lastslide", slideTogo);
    //pl.SetVar("visited" + p, 1);
    //Pagination();
}

function Pagination() {
    window.top.youtubeUrl = 'youtubeurl';
    window.top.introText = 'introText';
    var p = GetPlayer();
    if (!p) {
        alert('Ocorreu um erro na sincronização do objeto.')
        return;
    };
    window.top.player = p;
    window.top.youtubeUrl = p.GetVar('youtubeUrl');
    window.top.introText = p.GetVar('IntroText');
    for (var i = 1; i < 3; i++) {
        for (var j = 1; j < 10; j++) {
            var pag = p.GetVar("s" + i + j + "pag");
            if (!pag) {
                break
            };
            if (visitedPages[i - 1][j - 1].indexOf(pag) == -1) {
                visitedPages[i - 1][j - 1].push(pag);
            }
        };
    }
    saveData({
        k: 'pagination',
        v: JSON.stringify(visitedPages),
        u: window.top.userlogin
    });
    PaintNavCircles(visitedPages, p);
}

function getVisitedPages() {
    var p = window.top.player;
    var d = {
        user: window.top.userlogin
    }
    d.a = "getVisitedPages";
    $.ajax({
        url: ajaxUrl + 'mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).
    done(function(d) {
        PaintNavCircles(JSON.parse(d), p);
    }).
    fail(function() {}).
    always(function() {});
}

var pagOld;
function PaintNavCircles(d, pl) {
    setTimeout(function() {
        visitedPages = d;
        var m = pl.GetVar("moduloAtual");
        var s = pl.GetVar("scenceAtual");
        
        // Normalizando todos.
        // for (var i = 1; i <= 9; i++) {
        //     pl.SetVar("visited" + i, 0);
        // };
        // Pintando de acordo com o avanço gravado.
        for (var i = 0; i < visitedPages[m - 1][s - 1].length; i++) {
            pl.SetVar("visited" + visitedPages[m - 1][s - 1][i], -1);
        };
        var arr = visitedPages[m - 1][s - 1];


        var m = pl.GetVar("moduloAtual");
        var s = pl.GetVar("scenceAtual");
        var pag = pl.GetVar("s" + m + String(s) + "pag");
        if (pagOld != pag) {
            pagOld = pag;
            pl.SetVar("visited" + pag, 1);
        };

    }, 300)
}

function NavigateByHash() {
    var hash = decodeURIComponent(window.location.hash); //  #1101
    if (!hash) {
        return;
    };
    var pl = window.top.player;
    pl.SetVar("lastslide", hash.replace('#', ''));
}

function GetProgress() {
    return;
    getData(function(d) {
        var player = GetPlayer();
        // Tranformando o objeto num array para poder ordenar.
        var r = [];
        for (var n in d) {
            r.push(d[n])
        }
        // Ordenando ao contrário para ter a última página como primeiro item.
        r.sort(function(b, a) {
            if (a.k < b.k) return -1;
            if (a.k > b.k) return 1;
            return 0;
        });
        var depara = [
            ["609", "610"],
            ["509", "514"],
            ["", ""],
            ["", ""],
            ["", ""],
            ["410", "411"],
            ["", ""],
            ["", ""],
            ["", ""]
        ];
        var last = r[0].k.split('_');
        var lastscene = last[0][1];
        var lastslide = last[1];
        var lastanswer = last[2];
        var slideTogo = String(lastscene + lastslide);
        var t = depara.filter(function(e) {
            return e[0] == slideTogo;
        });
        if (t.length) {
            slideTogo = t[0][1];
        };
        //player.SetVar("lastslide", Number(slideTogo));
    })
}

function getUser(cb) {
    var d = {};
    d.a = "getUser";
    $.ajax({
        url: ajaxUrl + 'mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).done(function(d) {
        cb(d);
    }).fail(function() {}).always(function() {});
}

function getData(cb) {
    var d = {
        user: window.top.userlogin
    }
    d.a = "getData";
    $.ajax({
        url: ajaxUrl + 'mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).
    done(function(d) {
        cb(d);
    }).
    fail(function() {}).
    always(function() {});
}

function loadData(d) {
    d.a = "read";
    $.ajax({
        url: ajaxUrl + 'mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).done(function() {}).fail(function() {}).always(function() {});
}
$(document).ready(function($) {
    if ($('#iframeItauUnicef').length) {
        $('#iframeItauUnicef').css({
            'border': '0px',
            'width': '94%',
            'height': '98%',
            'margin-left': '3%'
        });
    };
    getUser(function(user) {
        window.top.player = window.top.articulateFrame.document.getElementById("player");
        window.top.username = user.firstname + ' ' + user.lastname;
        window.top.userlogin = user.username;
        getVisitedPages();
    });
});