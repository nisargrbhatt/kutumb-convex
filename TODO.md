# Storage Integration
- Need to integrate Cloudflare R2 to our service for saving blob files for application.
- This is used for profile where it will have profile picture function where you can attach photo to it for easy identification and will be visible in every place as a avatar.
- Routes should be protected properly so that no external attack on our blob storage is done.
- Have proper blob verification like filesize, mimetype, pixel size and all. Have a option to select the area of photo like editor to clip or select the area so that only that part is visible on avatar and possibly uploaded.

## Memory Feature Re-branded to Feed

- The @src/routes/_authed/_community/memories/index.tsx move this route to feed route
- Now feed has first item called memories feature, which is a place where community members can share a memory which will have Title, long description (kinda like wysiwyg editor), photo gallery (upto 5 items, images/short-videos (smaller than 2min and less than certain filesize)).
- It helps members share their own memories with other members, it will be a feed like experience where on that page user will see a infinite scroll pagination based items where each item is sorted by date newest first and on scroll new 10 items will be visible.
- The cards will show title, gallery and stripped description where whole description can be read on the memory detail page.
- members can like, share (as a link), comment on the memory.
- Now on the feed, members can either share memory, then in future we will have another kind of post also like announcement, polls, etc. So make this Feed feature dynamic enough that in future we can add those things easily.