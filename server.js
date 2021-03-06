var request = require('request').defaults({jar: true});
var nodemailer = require('nodemailer');
var jsdom = require('jsdom');
var argv = require('optimist')
  .alias('p', 'password')
  .demand(['p'])
  .argv;

var BASE_URI = 'http://www.anthropologie.com';
var WISHLIST_PATH = '/anthro/wishlist/wishlist.jsp?emailOrigin=true&giftlistId=';
var SALE_CLASS = '.wasPrice';

var WISHLISTS = {
  'gl_PHL2590928665': {
    email: ['analogmidnight@gmail.com', 'michelle@stripe.com'],
    text: [] // TODO
  }
};

// Anthro is silly and can't find the wishlist at first.
var DYNAMIC_REGEX = /\/anthro\/wishlist\/wishlist\.jsp\?emailOrigin=true&giftlistId=[A-Za-z0-9_]+(&_DARGS=\/.+&_dynSessConf=[A-Za-z0-9_\-]+)/g;

var smtpTransport = nodemailer.createTransport("SMTP",{
  service: "Gmail",
  auth: {
    user: "moosefrans@gmail.com",
    pass: argv.password
  }
});


var Scraper = function(wishlist) {
  this.wishlist = wishlist;
}

Scraper.prototype.scrape = function() {
  this.log('Scraping...');
  var uri = BASE_URI + WISHLIST_PATH + this.wishlist;
  var self = this;
  request(uri, function(err, res, body) {
    self.log('Retrieved wishlist successfully.');

    if (!err && res.statusCode === 200) {
      var match = body.match(DYNAMIC_REGEX);
      var correctMatch;
      if (match.length) {
        for (var i = 0, ii = match.length; i < ii; i += 1) {
          if (match[i].indexOf(self.wishlist) !== -1) {
            correctMatch = match[i];
          }
        }
      }

      if (!match || !correctMatch) {
        self.log('Unable to find this wishlist.');
      } else {
        self.log('Redirecting to dynamic wishlist...');
        request(BASE_URI + correctMatch, function(_err, _res, _body) {
          jsdom.env(
            _body,
            ["http://code.jquery.com/jquery.js"],
            self.parseWishlist.bind(self)
          )
        });
      }

    } else {
      this.log('Unable to reach Anthrologie with error: ' + err);
    }

    setTimeout(function() {
      self.scrape(self.wishlist);
    }, 900000); // Wait 30 mins before scraping again.

  });
}

Scraper.prototype.parseWishlist = function(errors, window) {
  this.log('Parsing wishlist...');
  if (errors) {
    this.log('Unable to parse page.');
    return;
  }

  var $ = window.$;
  var saleCount = 0;
  var body = '';
  $('.pinfotop1').each(function() {
    var $item = $(this);
    if ($item.find(SALE_CLASS).text()) {
      saleCount += 1;
      var product = $item.find('.productName').html();
      body += product;
      body += ': ' + $item.find('.pprice').text().split('was').join('( was') + ')';
      body += '<br>';
    }
  });

  if (saleCount > 0) {
    body = body.split('/anthro').join(BASE_URI + '/anthro');
    var saleStat = saleCount + '/' + $('.pinfotop1').length
      + ' items on your Anthro wishlist are on sale.';

    this.sendAlert(saleStat, body);
  } else {
    this.log('Found no sales.');
  }
  window.close();
}

Scraper.prototype.sendAlert = function(subject, contents) {
  var sentContents = WISHLISTS[this.wishlist].sent || {};
  if (sentContents[contents]) {
    this.log('No new sales.');
    return;
  }
  sentContents[contents] = 1;
  WISHLISTS[this.wishlist].sent = sentContents;

  this.log('Sending alert: ' + subject);
  var emails = WISHLISTS[this.wishlist].email;
  this.sendMail(emails.join(', '), subject, contents);
}

Scraper.prototype.sendMail = function(emails, subject, contents) {
  // TODO
  var self = this;
  smtpTransport.sendMail({
    from: 'Anthromoose <moosefrans@gmail.com>', // sender address
    to: emails, // list of receivers
    subject: subject, // Subject line
    text: contents, // plaintext body
    html: contents // html body
  }, function(err, res) {
    if (err) {
      self.log('Failed to send email: ' + err);
    } else {
      self.log('Sent emails to ' + emails);
    }
  });
}

Scraper.prototype.log = function(msg) {
  console.log('[' + this.wishlist + ']:', msg);
}

// Start scraping!
var ids = Object.keys(WISHLISTS);
for (var i = 0, ii = ids.length; i < ii; i += 1) {
  var scraper = new Scraper(ids[i]);
  scraper.scrape();
}
