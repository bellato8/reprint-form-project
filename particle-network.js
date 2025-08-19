(function(){
    const cnv = document.getElementById('web');
    if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let W, H, DPR = Math.min(2, window.devicePixelRatio || 1);
    let points = [];
    const COUNT = 90;
    const MAX_LINK = 140;
    const mouse = {x:0,y:0,active:false};

    function resize(){
        W = cnv.width = Math.floor(innerWidth * DPR);
        H = cnv.height = Math.floor(innerHeight * DPR);
        cnv.style.width = innerWidth+'px';
        cnv.style.height = innerHeight+'px';
        points = Array.from({length:COUNT}, () => makePoint());
    }
    function rnd(a,b){return a + Math.random()*(b-a)}
    function makePoint(){ return { x:rnd(0,W), y:rnd(0,H), vx:rnd(-0.25,0.25), vy:rnd(-0.25,0.25) }; }

    function step(){
        ctx.clearRect(0,0,W,H);
        for(let i=0;i<points.length;i++){
            const p = points[i];
            p.x+=p.vx; p.y+=p.vy;
            if (p.x<0||p.x>W) p.vx*=-1;
            if (p.y<0||p.y>H) p.vy*=-1;

            for(let j=i+1;j<points.length;j++){
                const q = points[j];
                const dx=p.x-q.x, dy=p.y-q.y;
                const d = Math.hypot(dx,dy);
                if (d<MAX_LINK*DPR){
                    const a = (1 - d/(MAX_LINK*DPR)) * 0.7;
                    ctx.strokeStyle = `rgba(88, 111, 160, ${a})`;
                    ctx.lineWidth = 1*DPR*a;
                    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
                }
            }
            if(mouse.active){
                const dx=p.x-mouse.x, dy=p.y-mouse.y;
                const d = Math.hypot(dx,dy);
                if(d<MAX_LINK*DPR){
                    const a = (1 - d/(MAX_LINK*DPR));
                    ctx.strokeStyle = `rgba(79, 124, 255, ${a*0.85})`;
                    ctx.lineWidth = 1.2*DPR*a;
                    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(mouse.x,mouse.y); ctx.stroke();
                }
            }
        }
        for(const p of points){
            ctx.fillStyle = 'rgba(130,150,190,.9)';
            ctx.beginPath(); ctx.arc(p.x,p.y, 1.6*DPR, 0, Math.PI*2); ctx.fill();
        }
        if(mouse.active){
            ctx.fillStyle='rgba(79,124,255,.95)';
            ctx.beginPath(); ctx.arc(mouse.x,mouse.y, 2.2*DPR, 0, Math.PI*2); ctx.fill();
        }
        requestAnimationFrame(step);
    }

    function setMouse(e){
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            mouse.active = false;
            return;
        }
        mouse.active = true;
        const rect = cnv.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) * DPR;
        mouse.y = (e.clientY - rect.top) * DPR;
    }
    window.addEventListener('mousemove', setMouse);
    window.addEventListener('mouseleave', ()=> mouse.active=false);
    window.addEventListener('resize', resize);
    resize(); step();
})();
