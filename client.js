class MusicSyncClient {
    constructor(roomId) {
        this.roomId = roomId;
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl("https://localhost:5001/musicHub")
            .withAutomaticReconnect()
            .build();
            
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.connection.on("RoomInfo", (roomInfo) => {
            console.log("Room info:", roomInfo);
            this.updateUI(roomInfo);
        });
        
        this.connection.on("TrackStarted", (data) => {
            console.log("Track started:", data);
            this.playTrack(data.track.s3Url, data.position);
        });
        
        this.connection.on("TrackPaused", (position) => {
            console.log("Track paused at:", position);
            this.pauseTrack();
        });
        
        this.connection.on("TrackSeeked", (position) => {
            console.log("Track seeked to:", position);
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
            this.handleSyncPosition(data);
        });
        
        this.connection.on("Error", (error) => {
            console.error("Error:", error);
            alert(error);
        });
    }
    
    async connect() {
        try {
            await this.connection.start();
            console.log("Connected to SignalR hub");
            await this.connection.invoke("JoinRoom", this.roomId);
        } catch (err) {
            console.error("Connection failed:", err);
        }
    }
    
    async playTrack(trackId, position) {
        await this.connection.invoke("PlayTrack", this.roomId, trackId, position);
    }
    
    async pauseTrack() {
        await this.connection.invoke("PauseTrack", this.roomId);
    }
    
    async seekTrack(position) {
        await this.connection.invoke("SeekTrack", this.roomId, position);
    }
    
    // Переименовал метод для отправки запроса на сервер
    async requestSync() {
        await this.connection.invoke("SyncPosition", this.roomId);
    }
    
    updateUI(roomInfo) {
        document.getElementById('roomName').textContent = roomInfo.roomName;
        document.getElementById('userCount').textContent = roomInfo.connectedUsers;
        
        const trackList = document.getElementById('trackList');
        trackList.innerHTML = '';
        
        roomInfo.tracks.forEach(track => {
            const li = document.createElement('li');
            li.textContent = `${track.artist} - ${track.title}`;
            li.onclick = () => this.playTrack(track.id, 0);
            trackList.appendChild(li);
        });
        
        if (roomInfo.currentTrack) {
            document.getElementById('currentTrack').textContent = 
                `${roomInfo.currentTrack.artist} - ${roomInfo.currentTrack.title}`;
        }
    }
    
    playTrack(url, position) {
        const audio = document.getElementById('audioPlayer');
        audio.src = url;
        audio.currentTime = position;
        audio.play();
    }
    
    pauseTrack() {
        document.getElementById('audioPlayer').pause();
    }
    
    seekTrack(position) {
        document.getElementById('audioPlayer').currentTime = position;
    }
    
    // Переименовал метод-обработчик для синхронизации
    handleSyncPosition(data) {
        const audio = document.getElementById('audioPlayer');
        if (data.isPlaying && audio.paused) {
            audio.currentTime = data.position;
            audio.play();
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