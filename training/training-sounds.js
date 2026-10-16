(function(){
  var ctx=null;
  function ac(){ if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)(); return ctx; }
  function tone(freq,dur,type,gain){
    try{ var c=ac(); var o=c.createOscillator(); var g=c.createGain(); o.type=type||'sine'; o.frequency.value=freq; g.gain.value=gain||0.08; o.connect(g); g.connect(c.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur); o.stop(c.currentTime+dur+0.02); }catch(e){}
  }
  window.RQFitSound={
    unlock:function(){ try{ ac().resume(); }catch(e){} },
    setLogged:function(){ tone(660,.12,'triangle',.08); setTimeout(function(){tone(880,.10,'triangle',.06)},110); },
    restStart:function(){ tone(330,.16,'sine',.07); },
    warn:function(){ tone(440,.12,'square',.055); },
    countdown:function(){ tone(760,.08,'square',.06); },
    ready:function(){ tone(880,.18,'triangle',.09); setTimeout(function(){tone(1175,.18,'triangle',.08)},170); },
    complete:function(){ [523,659,784,1046].forEach(function(f,i){setTimeout(function(){tone(f,.14,'triangle',.07)},i*120);}); }
  };
})();
