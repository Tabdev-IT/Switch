module.exports = {
  apps: [{
    name: 'bank-inquired-api',
    script: 'server.js',
    instances: 'max', // Use all available CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Logging configuration
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Process management
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    
    // Watch mode (for development)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log'],
    
    // Restart on file changes (development only)
    watch_delay: 1000,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 5000,
    
    // Environment variables
    env_file: '.env',
    
    // PM2 specific
    autorestart: true,
    cron_restart: '0 0 * * *', // Restart daily at midnight
    
    // Monitoring
    pmx: true,
    
    // Node.js options
    node_args: '--max-old-space-size=1024'
  }]
}; 