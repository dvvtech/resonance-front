class MusicSyncClient {
    constructor(roomId) {
        this.roomId = roomId;
        this.isUserReady = false; // Флаг готовности пользователя
        this.pendingTrack = null; // Сохраняем трек, если пришел до готовности
        this.connection = new signalR.HubConnectionBuilder()            
            .withUrl("http://192.168.0.47:5221/musicHub")
            .withAutomaticReconnect()
            .build();

        this.setupEventHandlers();
        this.isLocalAction = false;
        
        // Показываем блок готовности, скрываем плеер
        this.showReadyBlock();
    }

    showReadyBlock() {
        document.getElementById('readyBlock').style.display = 'block';
        document.getElementById('playerBlock').style.display = 'none';
    }

    showPlayerBlock() {
        document.getElementById('readyBlock').style.display = 'none';
        document.getElementById('playerBlock').style.display = 'block';
    }

    async onUserReady() {
        this.isUserReady = true;
        const audio = document.getElementById('audioPlayer');

        try {
            // Пробуем "разбудить" аудио элемент
            // Создаем тихий звук для активации
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
                console.log("AudioContext resumed");
            }
            
            // Создаем короткий тихий звук для полной активации
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.01; // Очень тихо
            oscillator.connect(gainNode).connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(0.1); // Останавливаем через 0.1 секунды
            
            console.log("Audio activated successfully");
            
        } catch (e) {
            console.log("Audio activation warning:", e);
            // Даже если не сработало, продолжаем
        }

        // Показываем плеер
        this.showPlayerBlock();
        
        // Подключаемся к комнате
        try {
            await this.connection.start();
            console.log("Connected to SignalR hub");
            await this.connection.invoke("JoinRoom", this.roomId);
            
            // Обновляем статус
            document.getElementById('listenerStatus').textContent = '✅ Вы в комнате и готовы слушать';
            
            // Если есть отложенный трек, воспроизводим его
            if (this.pendingTrack) {
                console.log("Playing pending track:", this.pendingTrack);
                this.playTrack1(this.pendingTrack.track.s3Url, this.pendingTrack.position);
                this.pendingTrack = null;
            }
        } catch (err) {
            console.error("Connection failed:", err);
            document.getElementById('listenerStatus').textContent = '❌ Ошибка подключения';
        }
    }

    setupEventHandlers() {
        this.connection.on("RoomInfo", (roomInfo) => {
            console.log("Room info:", roomInfo);
            this.updateUI(roomInfo);
            
            // Если пользователь не готов, но в комнате уже играет трек
            if (!this.isUserReady && roomInfo.isPlaying && roomInfo.currentTrack) {
                document.getElementById('readyMessage').innerHTML = 
                    `🎵 Сейчас играет: ${roomInfo.currentTrack.artist} - ${roomInfo.currentTrack.title}<br>
                     Нажмите кнопку выше, чтобы присоединиться!`;
            }
        });

        this.connection.on("TrackStarted", (data) => {
            console.log("Track started:", data);
            
            if (!this.isUserReady) {
                // Сохраняем трек для воспроизведения после готовности
                this.pendingTrack = data;
                console.log("Track saved for later:", data.track.title);
                
                // Обновляем сообщение о необходимости нажать кнопку
                document.getElementById('readyMessage').innerHTML = 
                    `🎵 Воспроизводится: ${data.track.artist} - ${data.track.title}<br>
                     Нажмите кнопку выше, чтобы присоединиться!`;
                return;
            }
            
            this.playTrack1(data.track.s3Url, data.position);
        });

        this.connection.on("TrackPaused", (position) => {
            console.log("Track paused at:", position);
            if (!this.isUserReady) return;
            this.pauseTrack();
        });

        this.connection.on("TrackSeeked", (position) => {
            console.log("Track seeked to:", position);
            if (!this.isUserReady) return;
            this.seekTrack(position);
        });

        this.connection.on("UserJoined", (userCount) => {
            console.log("User joined, total:", userCount);
            document.getElementById('userCount').textContent = userCount;
        });

        this.connection.on("UserLeft", (userCount) => {
            console.log("User left, total:", userCount);
            document.getElementById('userCount').textContent = userCount;
        });

        this.connection.on("SyncPosition", (data) => {
            console.log("Sync position:", data);
            if (!this.isUserReady) return;
            this.handleSyncPosition(data);
        });

        this.connection.on("Error", (error) => {
            console.error("Error:", error);
            alert(error);
        });
    }
    
    async playTrack(trackId, position) {
        this.isLocalAction = true;
        await this.connection.invoke("PlayTrack", this.roomId, trackId, position);
        this.isLocalAction = false;
    }
    
    async pauseTrack() {
        this.isLocalAction = true;
        await this.connection.invoke("PauseTrack", this.roomId);
        this.isLocalAction = false;
    }
    
    async seekTrack(position) {
        this.isLocalAction = true;
        await this.connection.invoke("SeekTrack", this.roomId, position);
        this.isLocalAction = false;
    }

    async requestSync() {
        await this.connection.invoke("SyncPosition", this.roomId);
    }

    updateUI(roomInfo) {
        document.getElementById('roomName').textContent = roomInfo.roomName || `Room ${this.roomId}`;
        document.getElementById('userCount').textContent = roomInfo.connectedUsers;

        const trackList = document.getElementById('trackList');
        trackList.innerHTML = '';

        roomInfo.tracks.forEach(track => {
            const li = document.createElement('li');
            li.textContent = `${track.artist} - ${track.title}`;
            
            // Добавляем кнопку "Играть" только для владельца (логику нужно доработать)
            // Пока просто делаем кликабельным
            li.style.cursor = 'pointer';
            li.onclick = () => this.playTrack(track.id, 0);
            
            trackList.appendChild(li);
        });

        if (roomInfo.currentTrack) {
            document.getElementById('currentTrack').textContent =
                `${roomInfo.currentTrack.artist} - ${roomInfo.currentTrack.title}`;
        }
    }

    playTrack1(url, position) {
        const audio = document.getElementById('audioPlayer');
        audio.src = url;
        audio.currentTime = position;

        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log("Playback started successfully");
                })
                .catch(error => {
                    console.log("Playback error:", error);
                    // Если ошибка, показываем кнопку готовности
                    if (error.name === 'NotAllowedError') {
                        this.isUserReady = false;
                        this.showReadyBlock();
                        document.getElementById('readyMessage').innerHTML = 
                            '⚠️ Нужно нажать кнопку "Приготовиться слушать" для активации звука';
                    }
                });
        }
    }

    pauseTrack() {
        document.getElementById('audioPlayer').pause();
    }

    seekTrack(position) {
        document.getElementById('audioPlayer').currentTime = position;
    }

    handleSyncPosition(data) {
        const audio = document.getElementById('audioPlayer');
        if (data.isPlaying && audio.paused) {
            audio.currentTime = data.position;
            audio.play().catch(e => console.log("Sync play error:", e));
        } else if (!data.isPlaying && !audio.paused) {
            audio.pause();
        } else {
            audio.currentTime = data.position;
        }
    }
}

// Экспортируем класс (для использования в модулях)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicSyncClient;
}