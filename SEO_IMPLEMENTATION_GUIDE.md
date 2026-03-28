# 🚀 Meezo SEO Complete Implementation Guide

## STEP 1: Fix Your DNS First ⚠️
**IMPORTANT: Before doing SEO, you MUST fix your domain pointing!**

Go back to register.lk:
1. Navigate to your domain settings
2. Find "Nameservers" section
3. Select **"Use custom nameservers"**
4. Enter:
   ```
   Nameserver 1: ns1.vercel-dns.com
   Nameserver 2: ns2.vercel-dns.com
   ```
5. Click **Save/Update**
6. Wait 5-30 minutes for DNS to propagate

---

## STEP 2: Google Search Console Setup

### 2.1 Add Your Domain
1. Go to https://search.google.com/search-console
2. Click **"Add property"**
3. Select **"Domain"** option
4. Enter: `meezo.lk`
5. Verify ownership using DNS record:
   - Google will give you a DNS TXT record
   - Go to register.lk DNS Manager
   - Add the TXT record Google provides
   - Verify in Google Search Console

### 2.2 Submit Sitemap
1. In Google Search Console, go to **Sitemaps**
2. Submit: `https://meezo.lk/sitemap.xml`
3. Google will start crawling your pages

### 2.3 Request Indexing
1. Go to **URL Inspection** tab
2. Paste: `https://meezo.lk`
3. Click **"Request Indexing"**
4. Do this for all important pages:
   - `https://meezo.lk/`
   - `https://meezo.lk/restaurants`
   - `https://meezo.lk/about`

---

## STEP 3: Google Analytics Setup

1. Go to https://analytics.google.com
2. Click **"Admin"** → **"Create Property"**
3. Enter property name: `Meezo`
4. Under "Data Collection", select **"Web"**
5. Add website URL: `https://meezo.lk`
6. Get your **Tracking ID** (format: `G-XXXXXXXXXX`)
7. In your `index.html`, replace `G-XXXXXXXXXX` with your actual ID

---

## STEP 4: Update Your Logo for SEO

1. Place your logo file in `/frontend/public/`
2. Name it: `logo.svg` or `app_logo.png`
3. Update the `schema-markup.html` with correct path

---

## STEP 5: Add Page-Level SEO Meta Tags

For each page in your React app, add:

```jsx
import { Helmet } from 'react-helmet';

function HomePage() {
  return (
    <>
      <Helmet>
        <title>Meezo - Fast Food Delivery in Sri Lanka</title>
        <meta name="description" content="Order food online from top restaurants..." />
        <meta property="og:title" content="Meezo - Fast Food Delivery" />
        <meta property="og:description" content="..." />
        <meta property="og:url" content="https://meezo.lk/" />
      </Helmet>
      {/* Page content */}
    </>
  );
}
```

---

## STEP 6: Backlinks & Content Strategy

To rank higher on Google:

1. **Quality Content**
   - Write blog posts about food delivery tips
   - Create guides for restaurants to use Meezo
   - Add FAQs about your service

2. **Social Media Links**
   - Create social media profiles
   - Link to your website
   - Post regular updates

3. **Local Business Listings**
   - Add to Google Business Profile (formerly Google My Business)
   - Add to local directories in Sri Lanka

4. **Guest Posts**
   - Write articles on food/tech blogs
   - Include link back to meezo.lk

---

## STEP 7: SEO Best Practices for Your App

### 7.1 URL Structure
✓ Use clean URLs: `/restaurants` not `/page?id=1`
✓ Use hyphens in URLs: `/fast-delivery` not `/fastDelivery`

### 7.2 Mobile Friendly
✓ Your site is already mobile responsive ✓

### 7.3 Page Speed
- Install Lighthouse Chrome extension to check speed
- Compress images before uploading
- Use lazy loading for images

### 7.4 Internal Linking
- Link between relevant pages
- Use descriptive anchor text: "Best restaurants near you" instead of "Click here"

---

## STEP 8: Submit to Other Search Engines

### Bing Webmaster Tools
1. Go to https://www.bing.com/webmasters
2. Add your site
3. Submit sitemap

### Yandex (if users from Russia)
1. Go to https://webmaster.yandex.com
2. Add your site

---

## STEP 9: Monitor Your Rankings

### Check Rankings (Google)
1. Google Search Console → Performance tab
2. See which keywords bring traffic
3. See your average ranking position

### Check Website Health
Every week, review:
- Google Search Console for errors
- Mobile usability issues
- Coverage issues

---

## STEP 10: Keywords to Target

### High Priority Keywords
- "food delivery Sri Lanka"
- "restaurant delivery Colombo"
- "online food order Sri Lanka"
- "fast food delivery"
- "meezo"

### Add Keywords to Your Content
- Include in page titles
- Include in meta descriptions
- Include naturally in page content

---

## 📋 Quick Checklist

✓ DNS pointing to Vercel (with ns1.vercel-dns.com & ns2.vercel-dns.com)
✓ robots.txt created at `/public/robots.txt`
✓ sitemap.xml created at `/public/sitemap.xml`
✓ Meta tags added to index.html
✓ Google Search Console setup
✓ Domain verified in GSC
✓ Sitemap submitted to GSC
✓ Google Analytics code added
✓ Schema markup added
✓ Social media profiles created and linked

---

## ⏰ Timeline

- **Immediately**: Fix DNS, setup GSC, Analytics
- **Week 1**: Google starts crawling your site
- **Week 2-4**: First keywords start ranking
- **Month 2-3**: Full coverage in Google index
- **Month 3-6**: Significant traffic increases

---

## 🆘 Troubleshooting

### Domain not showing in Google
- Wait 24-48 hours after DNS change
- Check in Google Search Console
- Manually request indexing

### Low traffic despite setup
- Create quality content
- Build backlinks
- Optimize for more keywords
- Use social media to drive traffic

### Pages not indexed
- Check robots.txt - make sure you're not blocking
- Check Search Console for crawl errors
- Resubmit sitemap

---

## 📞 Need Help?
- Google Search Console Help: https://support.google.com/webmasters
- Google Analytics Help: https://support.google.com/analytics
- Vercel Docs: https://vercel.com/docs

---

**Your website will start ranking in 2-6 weeks. The sooner you set up, the sooner you'll get customers!**
