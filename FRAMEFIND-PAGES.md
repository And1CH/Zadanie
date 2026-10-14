# Framefind on GitHub Pages

This branch contains a self-contained browser app at index.html.

In Settings → Pages, choose Deploy from a branch, branch framefind-pages, folder / (root), and Save. GitHub displays the site URL after deployment.

The public page queries Openverse and Wikimedia directly and stores its library in each browser. No secret or API key is bundled. Public provider availability and CORS policies still apply. Live asset retrieval has not yet been verified in the cloud environment because its network proxy denies the source requests.

Source code and tests are in framefind/. To regenerate the page after editing source:

    cd framefind
    npm test
    npm run build:standalone
    cp share/Framefind.html ../index.html

The existing .NET application source was left unchanged.
