# Deployment Configuration Guide

## ✅ Separate Hosting Setup (Current)

### Frontend (ar-food-app)
- **Hosting:** Vercel/Netlify recommended
- **Environment Variables to Set:**
  ```
  REACT_APP_API_URL=https://your-backend-url.vercel.app/api
  ```

### Backend (ar-food-backend)
- **Hosting:** Vercel/Railway/Render
- **URL:** https://3-d-food-render-backend-yduu.vercel.app
- **Environment Variables to Set:**
  ```
  PORT=5001
  MONGODB_URI=your_mongodb_connection_string
  JWT_SECRET=your_secure_jwt_secret
  JWT_EXPIRE=7d
  NODE_ENV=production
  ADMIN_PHONES=8148545814
  FRONTEND_URL=https://your-frontend-url.vercel.app
  ```

## 🔧 Configuration Changes Needed

### 1. **Frontend `.env` (FIXED ✅)**
```env
# OLD - Missing /api endpoint
REACT_APP_API_URL=https://3-d-food-render-backend-yduu.vercel.app/

# NEW - Correct with /api
REACT_APP_API_URL=https://3-d-food-render-backend-yduu.vercel.app/api
```

### 2. **Backend CORS Configuration**

Update `ar-food-backend/server.js` to allow your frontend domain:

```javascript
// In production, restrict to your frontend URL
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  'https://your-frontend-url.vercel.app',  // Production frontend
  'https://your-custom-domain.com'  // If you have custom domain
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 3. **Vercel Deployment Files**

#### For Frontend (`ar-food-app/vercel.json`):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

#### For Backend (`ar-food-backend/vercel.json`):
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

## 🚀 Deployment Steps

### Deploy Backend First:
1. Push code to GitHub
2. Import to Vercel
3. Set environment variables in Vercel dashboard
4. Copy the deployed URL

### Deploy Frontend Second:
1. Update `.env` with backend URL
2. Push code to GitHub
3. Import to Vercel
4. Set `REACT_APP_API_URL` in Vercel dashboard
5. Rebuild if needed

## 🐛 Common Login Issues & Solutions

### Issue 1: "Network Error" or "Failed to fetch"
**Cause:** Frontend can't reach backend
**Fix:** 
- Verify backend URL is correct: `https://backend-url.com/api`
- Check backend is running (visit URL in browser)
- Add `/api` at the end of backend URL

### Issue 2: CORS Error
**Cause:** Backend blocking frontend requests
**Fix:**
- Update backend CORS to include frontend URL
- Set `credentials: true` in both ends

### Issue 3: "Unauthorized" or Token Issues
**Cause:** JWT secret mismatch or token not sent
**Fix:**
- Check `JWT_SECRET` is same in backend `.env`
- Verify token is saved in localStorage
- Check Authorization header is sent

### Issue 4: MongoDB Connection Failed
**Cause:** Database connection string incorrect
**Fix:**
- Verify `MONGODB_URI` in backend environment variables
- Check MongoDB Atlas allows connections from 0.0.0.0/0
- Test connection string locally first

## 📱 Testing After Deployment

1. **Test Backend Health:**
   ```
   https://your-backend-url.vercel.app/api/health
   ```
   Should return: `{ "status": "ok", "message": "Server is running" }`

2. **Test Frontend:**
   - Open browser console (F12)
   - Try to login
   - Check Network tab for API calls
   - Verify API requests go to correct URL

3. **Check Logs:**
   - Vercel: Go to project → Deployments → Click deployment → View logs
   - Look for error messages

## 🔒 Security Checklist

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Set `NODE_ENV=production` in backend
- [ ] Restrict CORS to specific frontend domain
- [ ] MongoDB allows only necessary IPs
- [ ] Environment variables are set in hosting dashboard (not in code)

## 📞 Support

If login still fails, check:
1. Browser console for JavaScript errors
2. Network tab to see if API calls are made
3. Backend logs for server errors
4. Make sure both frontend and backend are deployed

---

**Current Status:**
- ✅ Backend deployed: https://3-d-food-render-backend-yduu.vercel.app
- ✅ Frontend `.env` fixed with correct API URL
- ⚠️ Need to update backend CORS with frontend URL
- ⚠️ Need to set environment variables in Vercel dashboard
