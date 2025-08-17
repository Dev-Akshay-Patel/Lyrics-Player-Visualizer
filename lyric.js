document.addEventListener('DOMContentLoaded', function () {

    const audioPlayer = document.getElementById('audio-player');
    const playBtn = document.querySelector('.play-btn');
    const progressBarContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress-bar');
    const currentTimeDisplay = document.querySelector('.current-time');
    const durationDisplay = document.querySelector('.duration');
    const lyricsScroll = document.querySelector('.lyrics-scroll');
    const lyricsContainer = document.querySelector('.lyrics-container');
    const songTitle = document.querySelector('.song-title');
    const audioFileInput = document.getElementById('audio-file');
    const lyricsFileInput = document.getElementById('lyrics-file');

    const progressWaveform = document.createElement('div');
    const timeTooltip = document.createElement('div');
    const playhead = document.createElement('div');

    progressBarContainer.innerHTML = '';
    progressBarContainer.appendChild(progressWaveform);
    progressBarContainer.appendChild(progressBar);
    progressBarContainer.appendChild(timeTooltip);
    progressBarContainer.appendChild(playhead);

    progressBarContainer.classList.add('soundcloud-progress-container');
    progressWaveform.classList.add('progress-waveform');
    progressBar.classList.add('soundcloud-progress-bar');
    timeTooltip.classList.add('time-tooltip');
    playhead.classList.add('playhead');

    const visualizerContainer = document.createElement('div');
    visualizerContainer.className = 'visualizer-container';

document.querySelector('.player-container').insertBefore(visualizerContainer, lyricsContainer.nextSibling);

    const canvas = document.createElement('canvas');
    canvas.className = 'visualizer-canvas';
    visualizerContainer.appendChild(canvas);

    let lyrics = [], isPlaying = false, songDuration = 0;
    let audioContext, analyser, dataArray, animationId, canvasCtx;
    let previousValues = [], particles = [];
    const barsCount = 32;

    let waveformData = [];
    let isDragging = false;
    let audioBuffer = null;
    let waveformWorker = null;

lyricsContainer.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        lyricsContainer.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === lyricsContainer) {
        lyricsContainer.classList.add('fullscreen-mode');
    } else {
        lyricsContainer.classList.remove('fullscreen-mode');
    }
});

    function initAudioContext() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        const source = audioContext.createMediaElementSource(audioPlayer);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        previousValues = new Array(dataArray.length).fill(0);
        canvasCtx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    async function generateWaveformData() {
        if (!audioPlayer.src) return;

        try {

            const response = await fetch(audioPlayer.src);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            if (!waveformWorker) {
                waveformWorker = new Worker(URL.createObjectURL(
                    new Blob(['(' + audioProcessingWorker.toString() + ')()'], 
                    { type: 'application/javascript' })
                ));

                waveformWorker.onmessage = function(e) {
                    waveformData = e.data;
                    renderWaveform();
                };
            }

            const channelData = audioBuffer.getChannelData(0);
            waveformWorker.postMessage({
                channelData: channelData,
                sampleRate: audioBuffer.sampleRate,
                width: progressBarContainer.clientWidth
            });

        } catch (error) {
            console.error("Error processing audio:", error);

            generateSimpleWaveform();
        }
    }

    function generateSimpleWaveform() {
        if (!audioBuffer) return;

        const channelData = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(channelData.length / samples);
        waveformData = [];

        for (let i = 0; i < samples; i++) {
            let sum = 0;
            const start = i * blockSize;
            const end = Math.min(start + blockSize, channelData.length);

            for (let j = start; j < end; j++) {
                sum += Math.abs(channelData[j]); 
            }

            const avg = sum / (end - start);
            waveformData.push(Math.max(1, avg * 100));
        }

        renderWaveform();
    }

    function audioProcessingWorker() {
        self.onmessage = function(e) {
            const { channelData, sampleRate, width } = e.data;
            const samplesPerPixel = Math.floor(channelData.length / width);
            const waveformPoints = [];

            for (let i = 0; i < width; i++) {
                const start = i * samplesPerPixel;
                const end = Math.min(start + samplesPerPixel, channelData.length);

                let sum = 0;
                for (let j = start; j < end; j++) {
                    sum += Math.abs(channelData[j]); 
                }

                const avg = sum / (end - start);
                waveformPoints.push(Math.max(5, avg * 100));
            }

            self.postMessage(waveformPoints);
        };
    }

    function renderWaveform() {
        progressWaveform.innerHTML = '';
        const width = progressBarContainer.clientWidth;
        const height = progressBarContainer.clientHeight;
        const segmentWidth = width / waveformData.length;

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        waveformData.forEach((value, i) => {
            const x = i * segmentWidth;
            const barHeight = value;
            const y = (height - barHeight) / 2;

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', segmentWidth * 0.8);
            rect.setAttribute('height', barHeight);
            rect.setAttribute('rx', segmentWidth * 0.4);
            rect.setAttribute('ry', segmentWidth * 0.4);
            rect.setAttribute('fill', 'rgba(255, 255, 255, 0.3)');
            rect.setAttribute('class', 'waveform-bar');

            svg.appendChild(rect);
        });

        progressWaveform.appendChild(svg);
    }

    function resizeCanvas() {
        const width = visualizerContainer.clientWidth;
        const height = window.innerWidth < 768 ? 100 : 140;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        canvasCtx.scale(dpr, dpr);
    }

   

    function drawVisualizer() {
        if (!analyser || !canvasCtx) return;
        analyser.getByteFrequencyData(dataArray);

        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        const segmentWidth = width / (dataArray.length - 1);
        const bassRange = dataArray.slice(0, dataArray.length * 0.25);
        const avgBass = bassRange.reduce((a, b) => a + b, 0) / bassRange.length;
        const bassScale = avgBass / 255;
        const time = Date.now() / 1000;
        const hue = (time * 40) % 360;

        canvasCtx.fillStyle = `rgba(0, 0, 0, 0.1)`;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = width / barsCount;
        canvasCtx.save();
        canvasCtx.shadowColor = `rgba(255,255,255,${bassScale})`;
        canvasCtx.shadowBlur = 20 + bassScale * 50;

        for (let i = 0; i < barsCount; i++) {
            const index = Math.floor(i * (dataArray.length / barsCount));
            const value = dataArray[index] / 255;
            const barHeight = value * height * 0.6;
            canvasCtx.fillStyle = `hsl(${(hue + i * 10) % 360}, 80%, ${50 + value * 50}%)`;
            canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth * 0.6, barHeight);
        }
        canvasCtx.restore();

        const points = [];
        for (let i = 0; i < dataArray.length; i++) {
            const raw = dataArray[i] / 255;
            const smooth = previousValues[i] * 0.8 + raw * 0.2;
            previousValues[i] = smooth;
            const x = i * segmentWidth;
            const y = height - (smooth * height * 0.8) + Math.sin(i * 0.2 + time * 3) * 5 * bassScale;
            points.push({ x, y });
        }

        canvasCtx.beginPath();
        canvasCtx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i < points.length - 2 ? points[i + 2] : p2;
            for (let t = 0; t <= 1; t += 0.1) {
                const pt = catmullRom(p0, p1, p2, p3, t);
                canvasCtx.lineTo(pt.x, pt.y);
            }
        }

        const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, `hsl(${hue}, 80%, 60%)`);
        gradient.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 80%, 70%)`);
        gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 80%, 60%)`);
        canvasCtx.strokeStyle = gradient;
        canvasCtx.lineWidth = 2 + bassScale * 8;
        canvasCtx.shadowBlur = 10 + bassScale * 30;
        canvasCtx.shadowColor = `rgba(255, 120, 255, ${0.3 + bassScale * 0.5})`;
        canvasCtx.lineJoin = 'round';
        canvasCtx.lineCap = 'round';
        canvasCtx.stroke();
        canvasCtx.shadowBlur = 0;

      const center = Math.floor(barsCount / 2);
const threshold = 0.6;

const rightStart = center + 4;
const rightEnd = center + 10;

for (let i = rightStart; i <= rightEnd && i < barsCount; i++) {
    const dataIndex = Math.floor(i * (dataArray.length / barsCount));
    const value = dataArray[dataIndex] / 255;

    if (value > threshold && Math.random() < 0.4) {
        const barHeight = value * height * 0.6;

        particles.push({
            x: (i + 0.5) * barWidth + (Math.random() - 0.5) * barWidth * 0.5,
            y: height - barHeight,
            alpha: 1,
            radius: 2 + Math.random() * 2,
            speed: 0.5 + Math.random() * 1,
            drift: (Math.random() - 0.5) * 2
        });
    }
}

        particles = particles.filter(p => p.alpha > 0.01);
        particles.forEach(p => {
            p.y -= p.speed;
            p.x += p.drift;
            p.alpha -= 0.01;
            p.radius *= 0.98;
            canvasCtx.beginPath();
            canvasCtx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
            canvasCtx.fillStyle = `hsla(${hue + 180}, 100%, 80%, ${p.alpha})`;
            canvasCtx.shadowColor = `hsla(${hue + 180}, 100%, 80%, ${p.alpha})`;
            canvasCtx.shadowBlur = 15;
            canvasCtx.fill();
        });

        animationId = requestAnimationFrame(drawVisualizer);
    }

    function loadAudio() {
        audioPlayer.addEventListener('loadedmetadata', () => {
            songDuration = audioPlayer.duration;
            durationDisplay.textContent = formatTime(songDuration);

            generateWaveformData();
        });
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

 function parseLRC(content) {
    lyrics = [];
    content.split('\n').forEach(line => {
        const match = line.match(/\[(\d+):(\d+).(\d+)\]/);
        if (match) {
            const [_, m, s, ms] = match;
            const time = parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 100;
            const text = line.replace(/\[.*?\]/g, '').trim();
            lyrics.push({ time, text });
        }
    });
    lyrics.sort((a, b) => a.time - b.time);
    renderLyrics();

    lyricsScroll.style.transform = 'translateY(0)';
}

    function renderLyrics() {
        lyricsScroll.innerHTML = '';
        lyrics.forEach(lyric => {
            const div = document.createElement('div');
            div.className = 'lyric-line';
            div.dataset.time = lyric.time;
            div.textContent = lyric.text;
            lyricsScroll.appendChild(div);
        });
    }

  function updateLyrics(time) {
    const lines = lyricsScroll.querySelectorAll('.lyric-line');
    let index = -1;
    for (let i = 0; i < lyrics.length; i++) {
        if (time >= lyrics[i].time) index = i;
        else break;
    }

    lines.forEach((el, i) => {
        el.classList.remove('active', 'visible', 'above', 'below');

        if (i === index) {
            el.classList.add('active', 'visible');
        } else if (document.fullscreenElement === lyricsContainer) {
            const distance = i - index;
            if (Math.abs(distance) <= 3) {
                el.classList.add('visible');
                if (distance < 0) el.classList.add('above');
                if (distance > 0) el.classList.add('below');
            }
        } else {

            el.classList.add('visible');
        }
    });

    if (index >= 0) {
        const active = lines[index];
        const scrollPos = active.offsetTop - lyricsContainer.clientHeight / 2 + active.clientHeight / 2;
        lyricsScroll.style.transition = 'transform 0.5s ease';
        lyricsScroll.style.transform = `translateY(-${scrollPos}px)`;
    }
}

    function updateProgressBar(time) {
        if (songDuration) {
            const progressPercent = (time / songDuration) * 100;
            progressBar.style.width = `${progressPercent}%`;
            playhead.style.left = `${progressPercent}%`;
            currentTimeDisplay.textContent = formatTime(time);
            updateLyrics(time);
        }
    }

    function handleProgressBarClick(e) {
        if (!songDuration) return;

        const rect = progressBarContainer.getBoundingClientRect();
        const clickPosition = e.clientX - rect.left;
        const percentClicked = (clickPosition / rect.width) * 100;
        const seekTime = (percentClicked / 100) * songDuration;

        audioPlayer.currentTime = seekTime;
        updateProgressBar(seekTime);
    }

    function handleProgressBarHover(e) {
        if (!songDuration) return;

        const rect = progressBarContainer.getBoundingClientRect();
        const hoverPosition = e.clientX - rect.left;
        const percentHovered = (hoverPosition / rect.width) * 100;
        const hoverTime = (percentHovered / 100) * songDuration;

        timeTooltip.textContent = formatTime(hoverTime);
        timeTooltip.style.left = `${hoverPosition}px`;
        timeTooltip.style.display = 'block';
    }

    playBtn.addEventListener('click', () => {
        if (!audioPlayer.src) return;
        if (isPlaying) {
            audioPlayer.pause();
            playBtn.textContent = 'Play';
            cancelAnimationFrame(animationId);
        } else {
            if (audioContext?.state === 'suspended') audioContext.resume();
            audioPlayer.play();
            playBtn.textContent = 'Pause';
            drawVisualizer();
        }
        isPlaying = !isPlaying;
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!isDragging) {
            updateProgressBar(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener('ended', () => {
        playBtn.textContent = 'Play';
        isPlaying = false;
        cancelAnimationFrame(animationId);
    });

    audioFileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            audioPlayer.src = URL.createObjectURL(file);
            songTitle.textContent = file.name.replace(/\.[^/.]+$/, '');
            loadAudio();
            playBtn.disabled = false;
            if (!audioContext) initAudioContext();
        }
    });

    lyricsFileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => parseLRC(ev.target.result);
            reader.readAsText(file);
        }
    });

    progressBarContainer.addEventListener('click', handleProgressBarClick);
    progressBarContainer.addEventListener('mousemove', handleProgressBarHover);
    progressBarContainer.addEventListener('mouseleave', () => {
        timeTooltip.style.display = 'none';
    });

    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        handleProgressBarClick(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleProgressBarClick(e);
            handleProgressBarHover(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('beforeunload', () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (audioContext) audioContext.close();
        if (waveformWorker) waveformWorker.terminate();
    });
});

const videoInput = document.getElementById('video-file');
const lyricsContainer = document.querySelector('.lyrics-container');

videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);

    const oldMedia = lyricsContainer.querySelector('.bg-media');
    if (oldMedia) oldMedia.remove();

    let mediaElement;

    if (file.type.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.src = url;
        mediaElement.autoplay = true;
        mediaElement.loop = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
    } else if (file.type.startsWith('image/')) {
        mediaElement = document.createElement('img');
        mediaElement.src = url;
    } else {
        alert("Unsupported file type.");
        return;
    }

    mediaElement.className = 'bg-media';
    Object.assign(mediaElement.style, {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 1,
        pointerEvents: 'none'
    });

    lyricsContainer.prepend(mediaElement);
});
