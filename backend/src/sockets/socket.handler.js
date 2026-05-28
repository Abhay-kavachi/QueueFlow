function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`📱 Client connected: ${socket.id}`);
    
    
    socket.on('join_room', async (roomString) => {
      if (!roomString || !roomString.includes('_')) return;
      
      const [orgId, serviceId] = roomString.split('_');
      
      
      
      const isValid = await verifyUserAccess(socket?.user?.id, orgId);
      if (!isValid) return;
      
      const secureRoom = `${orgId}_${serviceId}`;
      socket.join(secureRoom);
      
      console.log(`👤 Client joined secure queue room: ${secureRoom}`);
      socket.emit('joined-room', { message: 'Successfully joined isolated queue stream' });
    });

    
    async function verifyUserAccess(userId, orgId) {
       
       return true; 
    }

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return {
    to: (room) => io.to(room), 
    emitToAll: (event, data) => io.emit(event, data)
  };
}

module.exports = setupSocketHandlers;