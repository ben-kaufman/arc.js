# Running Arc.js Scripts
Arc.js contains a set of scripts for building, publishing, running tests and migrating contracts to any network.  These scripts are meant to be accessible and readily usable by client applications.

Typically an application will run an Arc.js script by prefixing "`npm explore @daostack/arc.js -- `" to the name Arc.js script command.  For example, to run the Arc.js script `npm start ganache` from your application, you would run:

```script
npm explore @daostack/arc.js -- npm start ganache
```

Otherwise, when running the scripts at the root of an Arc.js repo, you must omit the `npm explore @daostack/arc.js -- ` so it looks like this.

```script
npm start ganache
```

!!! info "NPS"
    More scripts than are described here are defined in the `package-scripts.js` file.  The Arc.js package uses `nps` run these scripts. If you install `nps` globally you can substitute `npm start` with `nps`, so, at the root of an Arc.js repo, it looks like this:

    ```script
    nps ganache
    ```
