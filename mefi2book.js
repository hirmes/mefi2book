
/*

	mefi2book - because sometimes the electricity goes out

	Website: http://hirmes.com/mefi2book
	 Source: http://github.com/hirmes/mefi2book

	 Author: David Hirmes (@hirmes)

	Version: 1.0.0 (11/15/2014)


	Output file is [www|ask|metatalk]_metafilter_[thread number].pdf
					(i.e. ask_metafilter_22130.pdf)

	Necessary support files:

	template_cover.html
	template_main.html

	For caching and debugging purposes, temp files are stored in the directory assigned to CACHE_DIR.
	There are three types of files in this directory:
	
	[www|ask|metatalk]_metafilter_[thread number]_original.html	- direct html file downloaded from metafilter.com
	[www|ask|metatalk]_metafilter_[thread number]_main.html		- based on template_main.html, filled in with content
	[www|ask|metatalk]_metafilter_[thread number]_cover.html	- based on template_cover.html, filled in with content
	[www|ask|metatalk]_metafilter_[thread number]_first_pass.pdf- PDF create to parse in order to generate the Contributor Index


*/

/** convert a metafilter thread into a print-ready PDF
 *	@namespace mefi2book
 */
var MEFI2BOOK = function() {

	"use strict";

	var	VERSION_NUMBER = "1.0.0",

		CACHE_DIR = "mefi2book_cached_files_here/",
		DOMAIN = "metafilter.com",

		pdfOptions = { 
			pageHeight: '9in',
			pageWidth: '6in',
			marginTop: '0.6in',
			marginBottom: '0.9in',
			marginLeft: '0.7in',
			marginRight: '0.7in',
			footerCenter: '[page]',
			footerFontSize: 8,
			footerSpacing: 8
		},

		request     = require("request"),
		fs          = require("fs"),
		moment      = require("moment"),			// Used to format post date
		wkhtmltopdf = require('wkhtmltopdf'),		// Turns HTML into a PDF.  Note: REQUIRES THE wkhtmltopdf BINARY TO BE INSTALLED ON YOUR SYSTEM
		cheerio		= require('cheerio'),			// used like jQuery
		addCommas	= require('add-commas'),		// format numbers
		typogr		= require('typogr'),			// convert to smart quotes, etc.
		extractpdf	= require('pdf-text-extract'),	// Pulls full text out of PDFs.  Note: REQUIRES THE TOOL pdftotext (WHICH IS PART OF THE xpdf SUITE) TO BE INSTALLED

		options		= require("nomnom")
			   .option('postnumber', {
				  abbr: 'p',
				  required: true,
				  help: 'The numberic ID of the post, found in its URL. REQUIRED',
				  callback: function(count) {
						if (count != parseInt(count)) {
						   return "postnumber must be a number";
						}
					 }
			   })
			   .option('subsite', {
				  abbr: 's',
					 default: 'www',
					 choices: ['www','ask','metatalk'],
					 help: 'The subsite. Valid options are www, ask, or metatalk.  Default is'
				  })
			   .option('nocache', {
			   		abbr: 'n',
			   		flag: true,
			   		default: false,
			   		help: 'Ignore cached files'
			   	})
			   .option('verbose', {
					flag: true,
					default: false,
					help: 'Output some messages as the script progresses'
			   })
			   .option('version', {
				  abbr: 'v',
				  flag: true,
				  help: 'Print version and exit',
				  callback: function() {
					 return "version " + VERSION_NUMBER;
				  }
			   })
			   .parse(),

		mefiSubSite = options.subsite,
		mefiThreadNumber = String(options.postnumber);

		if (!fs.existsSync(CACHE_DIR)){
			logger("Cache directory not found. Creating now.");
			try {
				fs.mkdirSync(CACHE_DIR);
			} catch(e) {
				logger("ERROR: Could not create cache directory (maybe a permissions thing?) Going to put temp files in root directory.");
				CACHE_DIR = "";
			}
		}

		// some threads for debugging
		//
		// mefiSubSite = "metatalk";
		// mefiSubSite = "ask";
		// mefiSubSite = "www";
		// mefiThreadNumber = "125946"; // Google Reader
		// mefiThreadNumber = "128149"; // Rob Ford
		// mefiThreadNumber = "91479"; // Steve Jobs Flash
		// mefiThreadNumber = "128901"; // Snowden
		// mefiThreadNumber = "22130"; // Porn in the woods (ask)
		// mefiThreadNumber = "20940"; // Hurricane Irene (meta)


	var	bookCover = CACHE_DIR+mefiSubSite+'_metafilter_'+mefiThreadNumber+'_cover.html',

		// load templates and turn them into DOM objects
		template = fs.readFileSync('template_main.html').toString(),
		out = cheerio.load(template),
		coverTemplate = fs.readFileSync('template_cover.html').toString(),
		outCover = cheerio.load(coverTemplate),

		cachedThread = CACHE_DIR+mefiSubSite+'_metafilter_'+mefiThreadNumber+'_original.html';


	/**
	 * start
	 * 
	 * begins the process by downloading a post or using a cached version
	 * @memberof mefi2book
	 */
	function start() {

		if ( options.nocache ) {
			scrapeThreadFromWeb();
		} else {
			fs.readFile(cachedThread, function(error, data) {
				if (error) {
					// if file doesn't exist in cached folder, grab from web
					if ( error.code == "ENOENT" ) {
						scrapeThreadFromWeb();
					} else {
						done("Error reading mefiThread from disk: " + error);
					}
				} else {
					logger("Reading post from CACHE");
					parseMefiThread(data.toString("utf8"));
				}
			});
		}
		
	}


	/**
	 * scrapeThreadFromWeb
	 *
	 * reads thread from web and saves in cache folder
	 *
	 */
	function scrapeThreadFromWeb() {
		logger("Reading post from WEB");
		request('http://'+mefiSubSite+'.'+DOMAIN+'/'+mefiThreadNumber, {
			encoding: 'utf8'
		}, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				fs.writeFile(cachedThread, body, function(err) {
					if (err) {
						done("ERROR: Could not save post locally: " + err);
					} else {
						logger("Post file was saved");
						parseMefiThread(body);
					}
				});
			} else {
				done("Error fetching post.  Maybe it doesn't exist? Here's the full error: " + error);
			}
		});
	}


	/**
	 * parseMefiThread
	 *
	 * takes a string of html, parses out the post and comment data,
	 * and exports a transitional PDF
	 * @memberof mefi2book
	 * @param {string} html the original html document from metafilter as a string
	 */
	function parseMefiThread(html) {

		// use typogr utility to swap straight quotes for curly quotes
		// (but first convert the text "&quot;" to actual quote character so typogr recognizes it)
		var newhtml = html.replace(/&quot;/gim,"\"");
		newhtml = typogr(newhtml).smartypants();

		// convert the html string into a DOM object
		var $ = cheerio.load(newhtml, { "decodeEntities": "false"});

		if ( $(".comments").length == 0 ) {
			done("Error: No comments found on this page");
		}

		// Grab the tags from the URL because the text versions can be truncated
		var tags = $('#taglist a').map(function () {
				var URI = $(this).attr("href"),
					parts = URI.split('/');
					return parts[parts.length-1];
			}).get();

		// remove some of the elements we're not interested in
		$(".go-to-anchor").remove();
		$(".feedicon").remove();
		$("#related").remove();
		$("#threadsub").remove();
		$(".whitesmallcopy").remove();
		$("script").remove();
		if ( $(".comments").last().text().indexOf("You are not logged in") != -1 ) {
			$(".comments").last().remove();
		}
		if ( $(".comments").last().text().indexOf("You are not currently logged in") != -1 ) {
			$(".comments").last().remove();
		}

		// gather the post title and date
		$(".posttitle span span").remove();
		$(".posttitle span a").remove();
		var postDate = $(".posttitle span").text();
		$(".posttitle span").remove();
		var postTitle = $(".posttitle").text();
		$(".posttitle").remove();
		logger("Title: " + postTitle + " with " + $(".comments").length + " comments");

		// build the cover pages
		outCover(".postNumberForCover").html("<i>N° " + mefiThreadNumber + "</i>");
		outCover(".postTitleForCover").text(postTitle);
		outCover("title").text(postTitle);
		outCover(".postDate").text(moment(postDate,"MMMM DD, YYYY").format("MMMM Do, YYYY") );
		outCover(".copyrightYear").text(moment(postDate,"MMMM DD, YYYY").format("YYYY"));
		if ( mefiSubSite == "ask" ) {
			outCover(".mefiSubSite").text("Ask");
			outCover(".mefiSubSiteTagline").text("Querying the Hive Mind");
		} else if ( mefiSubSite == "metatalk" ) {
			outCover(".mefiSubSite").text("Metatalk on ");
			outCover(".mefiSubSiteTagline").text("Feature Requests, Bugs, Etc.");
		} else {
			// default to www
		}

		// find the number of comments and put that in the title page
		var regex;
		if ( mefiSubSite == "ask" ) {
			regex = /\((\d*) answers total\)/;
		} else {
			regex = /\((\d*) comments total\)/;
		}
		var threadCommentTotal = regex.exec($(".copy").text())[1];
		outCover(".commentTotal").text(addCommas(threadCommentTotal));

		// add tags to the copyright page as topics
		var tagsString = "";
		tags.forEach( function(element, index, array) {
			tagsString = tagsString + "<span style='white-space:nowrap;'>" + (index+1) + ". " + element + ",</span> ";
		});
		tagsString = tagsString.substr(0,tagsString.length-9);
		tagsString = tagsString + "</span>";
		outCover(".topicsList").html(tagsString);

		outCover(".fullThreadURL").text(mefiSubSite + "."+DOMAIN+"/"+mefiThreadNumber);

		// write temp cover page html file
		fs.writeFile(bookCover, outCover.html());

		// format post
		var postAuthor = $(".postbyline a").first().text();
		$(".copy").slice(1).remove();
		$(".copy").find("span").remove();
		$(".copy").append("<div class='postAuthor'>&mdash; posted by "+postAuthor+"</div>");

		// format comments
		$(".comments .smallcopy").each( function() {
			var name = $("a",this).first().text();
			$(this).replaceWith("<div class='commentName'>&mdash; " + name + "</div><div class='spacer'>✸</div>");
		});
		$(".spacer").last().remove();

		if ( $(".comments").last().text() == "This thread has been archived and is closed to new comments" || $(".comments").last().text() == "This thread is closed to new comments. " || $(".comments").last().text() == "This thread is over 30 days old, and has been closed for archival purposes." ) {
			$(".comments").last().html("<div class='closedThread'>This thread has been archived and is closed to new comments</div>");
		}

		// make all the links purdy
		$("a").each( function(i, elem) {
			var text = $(this).text();
			$(this).html("<span class='linkfix'>"+text+"</span>");
		});

		// add formatted content to output object
		out(".main").append("<div class='sectionHead'><span class='circle'>◦</span> &nbsp; T H E &nbsp; P O S T &nbsp; <span class='circle'>◦</span></div>");
		out(".main").append($(".copy"));
		out(".main").append("<div class='sectionHead'><span class='circle'>◦</span> &nbsp; T H E &nbsp; C O M M E N T S &nbsp; <span class='circle'>◦</span></div>");
		out(".main").append($(".comments"));

		// save the formatted output to a temp file (useful for debugging)
		fs.writeFile(CACHE_DIR+mefiSubSite+'_metafilter_'+mefiThreadNumber+'_main.html', out.html());

		// build and save the first version of the pdf.  This is used later to build the Contributor Index.
		logger("Building first pass PDF");

		pdfOptions.cover = 'template_cover.html';
		pdfOptions.output = CACHE_DIR+mefiSubSite+'_metafilter_'+mefiThreadNumber+'_first_pass.pdf';

		wkhtmltopdf(out.html(), pdfOptions,
			function(code,signal) {
				if ( code ) {
					console.dir(code);
				} else {
					logger("Done with first pass");
					buildIndex();
				}
			}
		);

	}

	/**
	 * buildIndex
	 *
	 * 	builds the Contributors Index
	 * @memberof mefi2book
	 *
	 */
	function buildIndex() {
		var userNames = [], // an alphabetized array of all users in thread
			userIndex = {}; // a hash of usernames, where each one has an array of page #s where their comments are
		logger("Converting PDF to json");
		extractpdf(CACHE_DIR+mefiSubSite+'_metafilter_'+mefiThreadNumber+'_first_pass.pdf', function (err, pages) {
		  if (err) {
			done(err);
		  } else {
			logger("Found " + pages.length + " pages");

			pages.forEach( function(element, index, array) {
				var currentPage = index + 1;
				// find the names of the authors of each comment on the page
				var usersOnPage = element.match(new RegExp("   — (.*)\n", "g")) || []; 
				// clean up the names (shouldn't have to do this, what's the right way?)
				usersOnPage.forEach( function(element, index, array) {
					array[index] = element.match(new RegExp("   — (.*)\n"))[1];
				});
				//
				usersOnPage.forEach( function(element, index, array) {
					var userArray;
					if ( userIndex[element] ) {
						userArray = userIndex[element];
						if ( userArray[userArray.length-1] != currentPage ) {
							userArray[userArray.length] = currentPage;
						}
					} else {
						userNames.push(element);
						userIndex[element] = [];
						userArray = userIndex[element];
						userArray[0] = currentPage;
					}
				});
			});

			userNames.sort(function (a, b) {
				return a.toLowerCase().localeCompare(b.toLowerCase());
			});

			// build index in html
			var htmlIndex = "",
				indexItem = "",
				len = userNames.length;
			for ( var i=0;i<len;i++) {
				indexItem = "<div class='indexItem'><span class='indexItemName'>"+userNames[i]+"</span> ";
				var userPagesArray = userIndex[userNames[i]];
				for (var j=0;j<userPagesArray.length;j++) {
					indexItem = indexItem + userPagesArray[j] + ", ";
				}
				htmlIndex = htmlIndex + indexItem.substr(0,indexItem.length-2) + "</div>";
			}

			buildFinalPDF(htmlIndex);
			}
		});
	}

	/**
	 * buildFinalPDF
	 *
	 * 	assembles the pre-existing PDF with the new Contributor Index to produce
	    the final PDF
	 * @memberof mefi2book
	 * @param {string} htmlIndex the contributor index mark up to be appended to the book
	 */
	function buildFinalPDF(htmlIndex) {
		logger("Building final PDF");

		out(".contributorIndex").append(htmlIndex);

		pdfOptions.cover = bookCover;
		pdfOptions.output = mefiSubSite+'_metafilter_'+mefiThreadNumber+'.pdf';

		wkhtmltopdf(out.html(), pdfOptions,
			function(code,signal) {
				if (code) {
					console.dir(code);
				} else {
					logger("Done with final PDF!");
				}
			}
		);	
	}

	/**
	 * logger
	 *
	 * 	is a simple logger, off by default
	 * @memberof mefi2book
	 * @param {string} msg msg the message to be displayed
	 *
	 */
	function logger(msg) {
		if ( options.verbose ) console.log(msg);
	}

	/**
	 * done
	 *
	 * 	is a simple error and exit handler
	 * @memberof mefi2book
	 * @param {string} msg the message to be displayed before exiting
	 *
	 */
	function done(msg) {
	  if ( !msg ) msg = "Done!";
	  console.log(msg);
	  process.exit();
	}


	// get this party started
	start();

}();
