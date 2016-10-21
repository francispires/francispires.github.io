//  O SVG é uma solução elegante por permitir criar gráficos muitos detalhes e ser manipulado por javascript.
//  O SVG é um documento XML que define formas e corres.
//  Por sua natureza textual, o svg pode ser comprimido e manipulado facilmente usando javascript.
//  As mesmas manipulações do DOM podem ser executadas contra um SVG.
//  Como um documento dentro de outro o SVG carrega asincronamente e esta função tem como tarefa tornar o documento "clicável" assim que 
//  ele estiver pronto para receber cliques.
var JoyLoad = function () {
    // Refere-se ao objeto svg do joystick.
    var a = document.getElementById("joystick");
    // Pega o conteúdo do documento
    var svgDoc = a.contentDocument;
    var bf = svgDoc.getElementById('bf')
    var bb = svgDoc.getElementById('bb')
    var bl = svgDoc.getElementById('bl')
    var br = svgDoc.getElementById('br')
    var bc = svgDoc.getElementById('bc')
    
    var startTime;
    window.startTimer = function() {
      startTime = new Date();
    }
    window.timePassed = function() {
      return (new Date() - startTime)
    }
    
    $(bf).mousedown(function() {
      startTimer()
    }).mouseup(function() {
      sendMessage('bf:' + timePassed() + ';');
    });
    $(bf).bind('touchstart',function(){
      startTimer();
    });
    $(bf).bind('touchend',function(){
      sendMessage('bf:' + timePassed() + ';');
    });
    
    // Idem para os outros botões
    $(bb).mousedown(function() {startTimer()}).mouseup(function() {sendMessage('bb:' + timePassed() + ';');});
    $(bb).bind('touchstart',function(){startTimer()});
    $(bb).bind('touchend',function(){sendMessage('bb:' + timePassed() + ';');});
    
    $(br).mousedown(function() {startTimer()}).mouseup(function() {sendMessage('br:' + timePassed() + ';');});
    $(br).bind('touchstart',function(){startTimer()});
    $(br).bind('touchend',function(){sendMessage('br:' + timePassed() + ';');});
    
    $(bl).mousedown(function() {startTimer()}).mouseup(function() {sendMessage('bl:' + timePassed() + ';');});
    $(bl).bind('touchstart',function(){startTimer()});
    $(bl).bind('touchend',function(){sendMessage('bl:' + timePassed() + ';');});
    
    $(bc).mousedown(function() {startTimer()}).mouseup(function() {sendMessage('ld:' + interruptor() + ';');});
    $(bc).bind('touchstart',function(){startTimer()});
    $(bc).bind('touchend',function(){sendMessage('ld:' + interruptor()  + ';');});
    
    var ledIsOn = 0;
    function interruptor() {
      ledIsOn = ledIsOn==1?0:1;
      return ledIsOn;
    }
}