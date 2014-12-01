# mefi2book

This [node.js](http://nodejs.org/) script converts a post from [Metafilter](http://www.metafilter.com) into a PDF suitable for printing in book form.

### Dependencies

Once downloaded, run `npm update` to get the necessary node modules.

There are two dependencies that need to be installed outside of npm. The first is `wkhtmltopdf`, which has [pre-compiled packages](http://wkhtmltopdf.org/downloads.html) available for easy installation. The second is `pdftotext`, which is a part of the [xpdf](http://www.foolabs.com/xpdf/) suite of tools.  I had to download and install it manually, but you may be able to do it with your preferred package management tool.

### Usage

```
Usage: node mefi2book.js [options]

Options:
   -p, --postnumber   The numberic ID of the post, found in its URL. REQUIRED
   -s, --subsite      The subsite. Valid options are www, ask, or metatalk.  Default is  [www]
   --verbose          Output some messages as the script progresses  [false]
   -v, --version      Print version and exit
```

So, for example if you wanted a book version of the [Edward Snowden thread](http://www.metafilter.com/128901/I-do-not-expect-to-see-home-again), you would type:

$ `node mefi2book.js -p 128901`

Your computer will then chug along for 10-60 seconds, and produce a file called `www_metafilter_128901.pdf`

### Bugs

Please note that this script is relatively brittle.  If [mathowie] or [pb] decide to change class names or other markup, it could very well break this program.

* Some older threads that allowed images and had fewer markup restrictions (I'm looking at you 9622) can crash the script

### To Do

* Support different sized books
* Multiple threads in one book
* Deal to some degree with comments broken up between pages
* Generate a book jacket PDF

### Licence

GPLv3