const libx = require('libx.js');
libx.gulp = require("libx.js/node/gulp");
const path = require('path');
const fs = require('fs');
const argv = require('yargs').argv;

let projconfig;

(async ()=>{ /* init */ 
	var api = {};

	var dir = process.cwd(); //__dirname
	var src = dir + '/src';
	var dest = dir + '/build';
	
	var secretsFile = src + '/project-secrets.json';
	var secretsFileOpen = src + '/project-secrets-open.json';
	var secretsFileEmpty = src + '/project-secrets-Empty.json';
	var secretsKey = (argv.secret || process.env.FUSER_SECRET_KEY || "123").toString();
	// libx.log.info('!!! Secret key is: ', secretsKey);

	// var fs = require('fs');
	
	/*
	// await libx.gulp.copy(['./test.js', 'libx.gulp.js'], dest, libx.gulp.middlewares.minify );
	*/
	
	var copyProjectConfigToApi = async (shouldWatch)=> {
		await libx.gulp.copy([src + '/project.json'], './api/build', null, shouldWatch);
		await libx.gulp.copy([src + '/project-secrets.json'], './api/build', null, shouldWatch);
	}

	api.secretsLock = ()=>{
		if (!fs.existsSync(secretsFileOpen) && fs.existsSync(secretsFile)) {
			libx.log.w('SecretsLock: did not find decrypted file but has encrypted one, will decrypt...');
			libx.node.decryptFile(secretsFile, secretsKey, secretsFileOpen);
		}

		libx.node.encryptFile(secretsFileOpen, secretsKey, secretsFile);
		libx.log.info('Secrets file locked successfully');
	}
	api.secretsUnlock = ()=>{
		try {
			libx.node.decryptFile(secretsFile, secretsKey, secretsFileOpen);
			libx.log.info('Secrets file unlocked successfully');
		} catch(ex) { libx.log.warning('Could not decrypt secrets', ex); }
	}
	api.secretsEmpty = ()=>{
		libx.node.decryptFile(secretsFile, secretsKey, secretsFileOpen);
		var content = fs.readFileSync(secretsFileOpen);
		var obj = JSON.parse(content);
		var empty = libx.makeEmpty(obj);
		fs.writeFileSync(secretsFileEmpty, libx.jsonify(empty));

		libx.log.info('Empty secrets file was wrote successfully ', secretsFileEmpty);
	}
	
	if (argv.secretsLock) {
		api.secretsLock()
		return;
	}
	
	if (argv.secretsUnlock) {
		api.secretsUnlock();
		return;
	}

	if (argv.secretsEmpty) {
		api.secretsEmpty();
		return;
	}

	
	
	projconfig = libx.getProjectConfig(src, secretsKey);
	libx.gulp.projconfig = projconfig;

	var projName = projconfig.projectName.replace('-','_')

	api.deployRules = async () => {
		await copyProjectConfigToApi(false);

		var res = await libx.gulp.exec([
			'cd api', 
			'firebase use {0} --token {1}'.format(projconfig.firebaseProjectName, projconfig.private.firebaseToken), 
			'firebase deploy --only database --token {0}'.format(projconfig.private.firebaseToken),
		], true);
	}
	if (argv.deployRules) {
		api.deployRules();
		return;
	}

	libx.gulp.config.workdir = src;
	libx.gulp.config.devServer.port = projconfig.private.debugPort;
	libx.gulp.config.devServer.host = projconfig.private.host;
	libx.gulp.config.devServer.livePort = projconfig.private.livereloadPort;
	libx.gulp.config.devServer.useHttps = projconfig.private.debugIsSecure;
	// libx.gulp.config.isProd = projconfig.;

	if (argv.develop) {
		argv.watch = true;
		argv.serve = true;
		argv.build = true;
		argv.clearLibs = true;
	}

	var shouldWatch = argv.watch || false;
	var shouldServe= argv.serve || shouldWatch;
	var shouldServeLibs = argv.libs || false;

	process.on('uncaughtException', function (err) {
		console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
		console.error(err.stack, err);
		console.log("Node NOT Exiting...", err.stack, err);
		console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	});

	// build:
	var build = async () => {
		libx.log.info('build: starting');

		if (libx.gulp.getArgs().noDelete == null) { 
			libx.log.info('test: cleaning build folder: ', dest);
			await libx.gulp.delete(dest);
		}

		api.secretsLock();
		api.secretsEmpty();

		if (shouldServe && shouldServeLibs && !libx.gulp.config.isProd) {
			var res = libx.gulp.exec([
				'cd ../base-publish', 
				'http-server --cors --gzip -p 3888'
			], true);
		}

		// await libx.gulp.copy(src + '/views/views-templates.js', dest + '/views/', null, shouldWatch);

		var p1 = libx.gulp.copy([src + '/**/*.js', `!${src}/views/*`], dest + '/resources/', ()=>[
			// libx.gulp.middlewares.ifProd(libx.gulp.middlewares.babelify()),
			libx.gulp.middlewares.ifProd(libx.gulp.middlewares.minify()),
			// libx.gulp.middlewares.renameFunc(f=>f.basename='xx')
		], shouldWatch); 

		var p2 = libx.gulp.copy([src + '/**/*.less'], dest + '/resources/', ()=>[
			libx.gulp.middlewares.less(),
			libx.gulp.middlewares.ifProd(libx.gulp.middlewares.minifyLess()),
			libx.gulp.middlewares.renameFunc(f=>f.extname = ".min.css"),
		], shouldWatch, { useSourceDir: true });

		var p3 = libx.gulp.copy(src + '/views/**/*.pug', dest + '/views', ()=>[
			libx.gulp.middlewares.pug(),
			libx.gulp.middlewares.template('views'),
			// libx.gulp.middlewares.triggerChange(src + '/index.pug'),
		], shouldWatch, { useSourceDir: true });

		var p4 = libx.gulp.copy(src + '/components/**/*.pug', dest + '/resources/components', ()=>[
			libx.gulp.middlewares.pug(),
			libx.gulp.middlewares.write(dest + '/resources/components'),
			libx.gulp.middlewares.template('components'),
		], shouldWatch);

		var p5 = libx.gulp.copy(src + '/imgs/**/*', dest + '/resources/imgs/', null, shouldWatch);

		var p6 = libx.gulp.copy('./browserify/**/*.js', dest + '/resources/scripts/', ()=>[
			libx.gulp.middlewares.browserify({ bare: false }),
			libx.gulp.middlewares.ifProd(libx.gulp.middlewares.minify()),
			// libx.gulp.middlewares.concat('browserified.js'),
			// libx.gulp.middlewares.rename('browserified.js'),
			// libx.gulp.triggerChange(src + '/index.pug'),
			// libx.gulp.middlewares.liveReload(),
		], shouldWatch);
		
		await Promise.all([p1, p2, p3, p4 , p5, p6]);

		libx.gulp.copy('./node_modules/bundularjs/dist/fonts/**/*', dest + '/resources/fonts/lib/', null, false, { debug: false });
		libx.gulp.copy('./node_modules/ng-inline-edit/dist/ng-inline-edit.js', dest + '/resources/scripts/lib/', null, false);
		// libx.gulp.copy('./node_modules/bundularjs/src/scripts/lib/angular-inview.js', dest + '/resources/scripts/lib/', null, false);
		
		var pIndex = libx.gulp.copy([src + '/index.pug'], dest, ()=>[
			libx.gulp.middlewares.pug(),
			libx.gulp.middlewares.localize('./', dest), //, true),
			libx.gulp.middlewares.ifProd(libx.gulp.middlewares.usemin('build/')),
		], shouldWatch, { base: src });
		
		await pIndex;

		if (shouldWatch) {
			libx.gulp.watchSimple([src + '/_content.pug'], (ev, p)=>{
				if (ev.type != 'changed') return;
				libx.gulp.triggerChange(src + '/index.pug');
			});
		}

		if (shouldWatch && libx.gulp.config.isProd) {
			libx.gulp.watchSimple([dest + '/**/*'], (ev, p)=>{
				if (ev.type != 'changed') return;
				libx.gulp.triggerChange(src + '/index.pug');
			});
		}

		if (shouldWatch) {
			libx.gulp.watchSimple([process.cwd() + '/./node_modules/bundularjs/dist/**/*.js'], (ev, p)=>{
				if (ev.type != 'changed') return;
				libx.gulp.delete('./lib-cache');
				libx.gulp.triggerChange(src + '/index.pug');
			});
		}

		await copyProjectConfigToApi(shouldWatch);
		
		libx.log.info('build: done');
	}

	var clearLibs = async ()=> {
		console.log('fuser:clearLibs: cleaning cache folder "lib-cache"')
		await libx.gulp.delete('./lib-cache');
	}

	api.runlocal = async () => {
		await copyProjectConfigToApi(true);

		var res = await libx.gulp.exec([
			'cd api', 
			'source $(brew --prefix nvm)/nvm.sh; nvm use v8.12.0',
			'firebase use {0} --token {1}'.format(projconfig.firebaseProjectName, projconfig.private.firebaseToken), 
			'firebase serve -p {0} --only functions --token {1}'.format(projconfig.private.firebaseFunctionsPort, projconfig.private.firebaseToken)
		], true);
	}

	api.deploy = async () => {
		try {
			await libx.gulp.copy([src + '/project.json'], './api/build');
			await libx.gulp.copy([src + '/project-secrets.json'], './api/build');

			var res = await libx.gulp.exec([
				'cd api', 
				// 'npm install', 
				'firebase functions:config:set {0}.fuser_secret_key="{1}"'.format(projName, secretsKey),
				'firebase deploy -P {0} --only functions:{2}{3} --token "{1}"'.format(projconfig.firebaseProjectName, projconfig.private.firebaseToken, projName, argv.specificFunction ? ('-' + argv.specificFunction) : '')
			], true);
		} catch (ex) {
			console.log('error: ', ex);
		}
	}

	if (argv.clearLibs) await clearLibs();
	if (argv.build) await build();
	if (argv.apiRun) api.runlocal();
	if (argv.apiDeploy) api.deploy();
	
	if (shouldServe) {
		libx.log.info('test: serving...');
		libx.gulp.serve(dest, null, [dest + '/**/*.*']);
	}

	libx.log.info('done')
})();
