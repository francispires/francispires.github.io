var ajaxUrl = 'http://localhost/NEAD/';
//l.protocol+'//'+l.host+'/'+l.pathname
String.prototype.iluminate = function(amt) {
    var rgb = ';'
    hasAlpha = this.indexOf('rgba') > -1;
    rgb = this.replace('rgb' + (hasAlpha ? 'a' : '') + '(', '').replace(')', '');
    var vs = rgb.split(',');
    for (var i = 0; i < vs.length; i++) {
        vs[i] = Number(Number(vs[i]) + amt);
        vs[i] = vs[i] > 255 ? 255 : (vs[i] < 0 ? 0 : vs[i]);
    }
    return "rgb(" + vs.join(",") + ")";
};
var colors = {
        "C1": "rgb(137, 176, 232)", //   Azul
        "C2": "rgb(237, 158, 73)", //    Laranja
        "C3": "rgb(175, 214, 141)" //    Verde
    }
    //  Define que uma scene terminou.
var finalAnswers = [
    ["121", "141", "101", "101", "141", "093"], // Módulo 1
    ["", "", "", "", "", ""], // Módulo 2 -- Not Done
    ["", "", "", "", "", ""] // Módulo 3 -- Not Done
];
//  Onde vou quando navegar para uma scene.
var firstSlides = [
    ["101", "201", "301", "401", "501", "601"], // Módulo 1
    ["", "", "", "", "", ""], // Módulo 2 -- Not Done
    ["", "", "", "", "", ""] // Módulo 3 -- Not Done
];
//  Armazena meu progresso
var progresso = {
    "l11": "1",
    "l12": "1",
    "l13": "1",
    "l14": "1",
    "l15": "1",
    "l16": "1",
    "l17": "1",
    "l21": "1",
    "l22": "1",
    "l23": "1",
    "l24": "1",
    "l25": "1",
    "l26": "1",
    "l27": "0",
    "l31": "-1",
    "l32": "-1",
    "l33": "-1",
    "l34": "-1",
    "l35": "-1",
    "l36": "-1",
    "l37": "-1"
};
// Atualiza meu progresso e chama update colors para pintar a árvore
function PaintTree() {
    return false;
    getData(
        function(d) {
        var r = [];
        for (var n in d) {
            r.push(d[n])
        }
        $.each(r, function(i, v) {
            var me = v.k.split('_');
            var modulo = me[0][0];
            modulo = modulo == 'a' ? 1 : (modulo = modulo == 'b' ? 2 : 3);
            var scene = Number(Number(me[0][1]));
            var slide = me[1];
            var answer = me[2];
            var leave = String("l" + String(String(modulo) + scene));
            if (finalAnswers[modulo - 1][scene - 1] == String(slide + answer)) {
                var newLeave = String("l" + String(String(Number(modulo)) + (Number(scene) + 1)));
                progresso[newLeave] = "0";
                progresso[leave] = "1";
            } else {
                progresso[leave] = "0";
            }
        });
        //  1 nas anteriores
        var max;
        for (var l in progresso) {
            if (progresso[l] == "0") {
                max = l;
            };
        }
        for (var l in progresso) {
            if (l == max) {
                break;
            };
            if (progresso[l] == "0") {
                progresso[l] = "1";
            };
        }
        var currentLeave = String("l" + String(String(Number(m)) + (Number(s))));
        progresso[currentLeave] = "0";
        
        if (m == 1) {
            if (progresso['l11'] == "-1") {
                progresso['l11'] = "0";
            };
        };
        if (m == 2) {
            if (progresso['l21'] == "-1") {
            //    progresso['l21'] = "0";
            };
        };
        if (m == 3) {
            if (progresso['l31'] == "-1") {
                progresso['l31'] = "0";
            };
        };
        var lastZero;
        for (var o in progresso) {
            if (progresso[o] == "0") {
                lastZero = o
            };
        }
        for (var o in progresso) {
            if (progresso[o] == "0" && o!=lastZero) {
                progresso[o]="1"
            };   
        }
        updateColors();
    });
}

//  Pinta a árvore.
var updateColors = function() {
        //  -1 ->   opaco   -> futuro
        //   0 ->   escuro  -> presente
        //   1 ->   verde   -> passado
        
        var svgDoc = $('object#tree')[0].contentDocument;

        var baseInterval = 200;
        var i = 1;
        var svgItem = $('#l21', svgDoc);
        var GREEN = "rgb(0, 154, 23)";
        $.each(progresso, function(name, value) {
            setTimeout(function() {
                //  SVG animation
                var svgItem = $('#' + name, svgDoc);
                var numItem = $('#num' + name.replace('l', ''), svgDoc);
                var c = colors['C' + $(svgItem).attr('id')[1]]
                $(svgItem).hover(function() {
                    $(numItem).addClass('numHover');
                }, function() {
                    $(numItem).removeClass('numHover');
                })
                if (value == "-1") {} else if (value == "0") {
                    $(svgItem).children().css('fill', c.iluminate(-127));
                    $(svgItem).children().each(function(i, v) {
                        setTimeout(function() {
                            $(v).addClass('animate')
                        }, i * 150); //  Intervalo entre as folhas "acendendo" e "apagando".
                    });
                    $(svgItem).children().css('cursor', 'pointer');
                    $(numItem).addClass('numFix');
                    $(svgItem).children().click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                    $(svgItem).click(function(event) {
                        GoTo(classToPag($(this).attr('id')));
                    });
                    $(numItem).click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                    $(numItem).find('tspan').click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                } else if (value == "1") {
                    $(svgItem).children().removeClass('animate').css('cursor', 'pointer');
                    $(svgItem).children().css('fill', GREEN);
                    $(numItem).addClass('numFix');
                    $(svgItem).children().click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                    $(svgItem).click(function(event) {
                        GoTo(classToPag($(this).attr('id')));
                    });
                    $(numItem).click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                    $(numItem).find('tspan').click(function(event) {
                        GoTo(classToPag($(svgItem).attr('id')));
                    });
                }
            }, baseInterval * i++);
        });
    }
    //  Navega para um slide
setTimeout(function () {
    updateColors();
},1000)
function GoTo(pag) {
    window.top.player.SetVar('lastslide', pag);
}
//  Navega para um slide de acordo com meu progresso.
function GetProgress() {
    getData(function(d) {
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
    });
}
// Retorna informações do ajax.php
function getData(cb) {
    var d = {
        user: window.top.userlogin
    }
    var progresso = {
    "l11": "-1",
    "l12": "-1",
    "l13": "-1",
    "l14": "-1",
    "l15": "-1",
    "l16": "-1",
    "l17": "-1",
    "l21": "-1",
    "l22": "-1",
    "l23": "-1",
    "l24": "-1",
    "l25": "-1",
    "l26": "-1",
    "l27": "-1",
    "l31": "-1",
    "l32": "-1",
    "l33": "-1",
    "l34": "-1",
    "l35": "-1",
    "l36": "-1",
    "l37": "-1"
    };
    cb(progresso);
    return;
    d.a = "getData";
    $.ajax({
        url: ajaxUrl + '/mod/scorm/ajax.php',
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
        url: ajaxUrl + '/mod/scorm/ajax.php',
        type: 'POST',
        dataType: 'json',
        data: d
    }).done(function() {}).fail(function() {}).always(function() {});
}
// Traduz uma folha para a página.
var classToPag = function(cls) {
        // l21,l23....1101
        var mod = cls[1];
        var sld = cls[2];
        var pag = '01';
        return mod + sld + pag;
    }
    //  Limpa todo meu progresso
var clearProgresso = function() {
        $.each(progresso, function(p, v) {
            progresso[p] = "-1";
        });
        updateColors();
    }
    //  Completa todo meu progresso
var completeProgresso = function(dones) {
    $.each(progresso, function(p, v) {
        progresso[p] = "1";
    });
    updateColors();
}
$(document).ready(function($) {
    setTimeout(function() {
        window.top.treeFrame.PaintTree();
    }, 500);
});

function animLeave(leave) {
    if (!leave) {
        return
    };
    $(leave).animate({
        'background': $(leave).css('background-color').iluminate(50)
    }, 2000).animate({
        'background': $(leave).css('background-color').iluminate(-50)
    }, 2000, animLeave);
}

function animStop(leave) {
    $(leave).stop();
}

function animSeta(seta) {
    $(seta).animate({
        marginTop: 90
    }, 2000).animate({
        marginTop: 0
    }, 2000, animSeta);
}