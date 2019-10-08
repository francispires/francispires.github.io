/*
var i = 1;
$('.progress .circle').removeClass().addClass('circle');
$('.progress .bar').removeClass().addClass('bar');
setInterval(function () {
    $('.progress .circle:nth-of-type(' + i + ')').addClass('active');
    $('.progress .circle:nth-of-type(' + (i - 1) + ')').removeClass('active').addClass('done');
    
    $('.progress .bar:nth-of-type(' + (i - 1) + ')').addClass('active');
    $('.progress .bar:nth-of-type(' + (i - 2) + ')').removeClass('active');
    i++;
    if (i == 0) {
        $('.progress .bar').removeClass().addClass('bar');
        $('.progress div.circle').removeClass().addClass('circle');
        i = 1;
    }
}, 1000000000000);
*/

var $ppc = $('.progress-pie-chart'),
    percent = parseInt($ppc.data('percent')),
    deg = 360*percent/100;
if (percent > 50) {
$ppc.addClass('gt-50');
}
$('.ppc-progress-fill').css('transform','rotate('+ deg +'deg)');
$('.ppc-percents span').html(percent+'%');

$('.circle').click(function () {
    if ($(this).hasClass('disabled')) {
        //return;
    }
    var t = $(this)
    var q = t.closest('.question');
    var p = t.closest('.progress');
    var idx = parseInt($(this).find('.label').text()) + 1;

    var r = true;
    q.find('input').each(function (i,v) {
        if ($(this).val()>1 && $(this).val()==idx) {
            r = false;
        }
    });

    if (!r) {return r;}

    p.find('input').val(idx);

    p.find('.square span').text(idx-1)
    p.find('.circle:not(.first)').removeClass('active').removeClass('disabled');
    t.addClass('active');
    t.removeClass('disabled')

    q.find('.progress').each(function (i,v) {
        var s = $(this).find('input').val() || 0;
        //clear
        $(this).find('.bar').removeClass('active').removeClass('done');
        //disabled all
        q.find('.progress .circle:nth-of-type(' + (s) + '):not(.first)').addClass('disabled');
        //enable me
        $(this).find('.circle:nth-of-type(' + (s) + ')').removeClass('disabled');

        for (var i = 0; i < s; i++) {
            $(this).find('.bar:nth-of-type(' + (i) + ')').addClass('active').addClass('done');
        }
    });

    //q.find('.progress .circle:nth-of-type(' + (idx.toString()) + ')').addClass('disabled');
    /*
    $(this).find('.progress .bar').removeClass('active').removeClass('done');
    for (var i = 0; i < idx; i++) {
        $(this).closest('.progress').find('.bar:nth-of-type( '+(i)+' )').removeClass('active').addClass('done');
    }
    */
    //$('.progress .bar:nth-of-type(' + (idx -1) + ')').addClass('active');
    //$('.progress .bar:nth-of-type(' + (idx - 2) + ')').removeClass('active').addClass('done');
});
function draw(q,val){
    r = true;
    q.find('input').each(function (i,v) {
        if ($(this).val()==val) {
            r =  false;
        }
    });
    if (!r) {return r;}

    q.find('.progress').each(function (i,v) {
        var p = $(this);
        var s = p.find('input').val() || 0;
        p.find('.bar').removeClass('active').removeClass('done');
        q.find('.progress .circle:nth-of-type(' + (s) + ')').addClass('disabled');
        p.find('.circle:nth-of-type(' + (s) + ')').removeClass('disabled');
        for (var i = 0; i < s; i++) {
            p.find('.bar:nth-of-type(' + (i) + ')').addClass('active').addClass('done').prev().removeClass('disabled');
        }
    });
}