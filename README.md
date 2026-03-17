## Requirements
- cPanel with Node.js support (Setup Node.js App feature)
- PostgreSQL database
- Node.js 18.x or 20.x

## Step-by-Step Deployment

### 1. Upload Files
1. Upload this entire folder to your cPanel (e.g., `/home/username/pumpbase`)
2. You can use File Manager or FTP

### 2. Create PostgreSQL Database
1. In cPanel, go to "PostgreSQL Databases"
2. Create a new database and user
3. Note down: database name, username, password, host (usually localhost)

### 3. Setup Node.js App in cPanel
1. In cPanel, search for "Setup Node.js App"
2. Click "Create Application"
3. Fill in:
   - **Node.js Version**: 18.x or 20.x
   - **Application Mode**: Production
   - **Application Root**: `/home/username/pumpbase` (your upload path)
   - **Application URL**: Your domain
   - **Application Startup File**: `index.cjs`

### 4. Set Environment Variables
In the Node.js App setup page, add these environment variables:

| Variable | Value |
|----------|-------|
| NODE_ENV | production |
| DATABASE_URL | postgresql://user:password@localhost:5432/dbname |
| PORT | (leave blank, cPanel assigns automatically) |

Replace `user`, `password`, `localhost`, `5432`, and `dbname` with your actual database credentials.

### 5. Install Dependencies
1. Click "Run NPM Install" in the Node.js App interface
2. Wait for installation to complete

### 6. Start the Application
1. Click "Start App" or "Restart"
2. Visit your domain to see the app

## Troubleshooting

### App not starting
- Check error logs in cPanel Node.js App interface
- Verify DATABASE_URL is correct
- Make sure PostgreSQL database exists

### Database connection errors
- Verify database credentials
- Check if database user has proper permissions
- Try connecting via cPanel Terminal: `psql $DATABASE_URL`

### 502 Bad Gateway
- The app might need more time to start
- Check if port is correctly assigned by cPanel
- Review error logs

### Static files not loading
- Ensure the `public` folder is in the same directory as `index.cjs`
- Check file permissions (should be 644 for files, 755 for directories)

## File Structure
```
pumpbase/
├── index.cjs          # Main server file (compiled)
├── package.json       # Dependencies
├── README.md          # This file
└── public/            # Frontend files
    ├── index.html
    └── assets/
        ├── *.js
        ├── *.css
        └── *.png
```

## Database Schema
The app will automatically create tables on first run if they don't exist.
If you need to reset the database, drop all tables and restart the app.

## Support
This app fetches token data from external APIs (pumpbase.fun, ape.store, dexscreener).
Make sure your server can make outbound HTTPS requests.
