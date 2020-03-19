/* License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl). */


odoo.define("pos_jsprintmanager.screen", function (require) {
    "use strict";

    var core = require('web.core');
    var _t = core._t;
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var screens = require('point_of_sale.screens');

    screens.ReceiptScreenWidget.include({

        //Check JSPM WebSocket status
        jspmWSStatus: function() {
            if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.Open)
                return true;
            else if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.Closed) {
                alert('JSPrintManager (JSPM) is not installed or not running! Download JSPM Client App from https://neodynamic.com/downloads/jspm');
                return false;
            }
            else if (JSPM.JSPrintManager.websocket_status == JSPM.WSStatus.BlackListed) {
                alert('JSPM has blacklisted this website!');
                return false;
            }
        },

        init: function(parent,options){
            this._super(parent,options);
            JSPM.JSPrintManager.auto_reconnect = true;
            JSPM.JSPrintManager.start();
            var jspmWSStatus = this.jspmWSStatus()
            JSPM.JSPrintManager.WS.onStatusChanged = function () {
                if (jspmWSStatus) {
                    //get client installed printers
                    JSPM.JSPrintManager.getPrinters().then(function (myPrinters) {
                        var options = '';
                        for (var i = 0; i < myPrinters.length; i++) {
                            options += '<option>' + myPrinters[i] + '</option>';
                        }
                        $('#installedPrinterName').html(options);
                    })
                }
            }
        },

        get_escpos_receipt_cmds: function() {
            var order = this.pos.get_order();
            var receipt = order.export_for_printing();
            var orderlines = order.get_orderlines();
            var paymentlines = order.get_paymentlines();
            console.log(order)
            console.log(receipt)
            console.log(orderlines)
            console.log(paymentlines)

            var esc = '\x1B'; //ESC byte in hex notation
            var newLine = '\x0A'; //LF byte in hex notation
            var cmds = esc + "@"; //Initializes the printer (ESC @)

            cmds += esc + '!' + '\x38'; //Emphasized + Double-height + Double-width mode selected (ESC ! (8 + 16 + 32)) 56 dec => 38 hex
            // Title of receipt
            cmds += receipt.date.localestring + " " + receipt.name;
            cmds += newLine + newLine;
            // Header of receipt with Company data
            cmds += receipt.company.contact_address ? receipt.company.contact_address + newLine : "";
            cmds += receipt.company.phone ? _t("Tel: ") + receipt.company.phone + newLine : "";
            cmds += receipt.company.vat ? _t("VAT: ") + receipt.company.vat + newLine : "";
            cmds += receipt.company.email ? receipt.company.email + newLine : "";
            cmds += receipt.company.website ? receipt.company.website + newLine : "";
            cmds += receipt.company.header ? receipt.company.header + newLine : "";
            cmds += receipt.cashier ? (newLine + "--------------------------------" + newLine + _t("Served by ") + receipt.cashier) : "";
            cmds += newLine + newLine;

            // Order Lines
            for (const line of orderlines) {
                let lineLength = 30;
                let productName = line.get_product().display_name;
                let quantity = "" + line.get_quantity_str_with_unit();
                let price = "" + this.format_currency(line.get_display_price());
                let freeSpace = lineLength - productName.length - quantity.length - price.length - 1
                if (freeSpace > 0) {
                    console.log(freeSpace)
                    cmds += productName.padEnd(freeSpace, " ") + quantity + " " + price + newLine
                }
            }
            cmds += newLine + newLine;

            // Subtotal
            cmds += _t("Subtotal: ") + this.format_currency(order.get_total_without_tax()) + newLine;
            // Taxes
            for (const taxdetail of order.get_tax_details()) {
                cmd += taxdetail.name + " " + this.format_currency(taxdetail.amount) + newLine;
            }
            // Discounts
            if (order.get_total_discount() > 0) {
                cmds += _t("Discount: ") + this.format_currency(order.get_total_discount()) + newLine;
            }
            // Total amount
            cmds += _t("Total: ") + this.format_currency(order.get_total_with_tax()) + newLine;
            cmds += newLine;

            // Payment Lines
            for (const line of paymentlines) {
                cmds += line.name + " " + this.format_currency(line.get_amount()) + newLine;
            }
            cmds += newLine;
            // Change
            cmds += _t("Change: ") + this.format_currency(order.get_change()) + newLine;
            cmds += newLine;

            // Footer
            if (receipt.footer) {
                cmds += receipt.footer;
            }
            console.log(cmds)

            return cmds
        },

        print_web: function() {
            if (this.jspmWSStatus && this.pos.config.use_jsprintmanager == true) {
                var outputFormat = this.pos.config.jsprintmanager_output_format;
                var default_printer = this.pos.config.jsprintmanager_default_receipt_printer;
                console.log(outputFormat)
                //Create a ClientPrintJob
                var cpj = new JSPM.ClientPrintJob();
                if (default_printer) {
                    cpj.clientPrinter = new JSPM.InstalledPrinter(default_printer);
                } else {
                    cpj.clientPrinter = new JSPM.DefaultPrinter();
                }
                if (outputFormat == 'escpos'){
                    //Set content to print...
                    //Create ESP/POS commands for sample label
                    var cmds = this.get_escpos_receipt_cmds()
                    cpj.printerCommands = cmds;
                    //Send print job to printer!
                    cpj.sendToClient();
                } else {
                    //generate an image of HTML content through html2canvas utility
                    var ticket = document.getElementsByClassName('pos-sale-ticket')[0]
                    html2canvas(ticket, {scale: 10, width: 900}).then(function (canvas) {
                        //Set content to print...
                        var b64Prefix = "data:image/png;base64,";
                        var imgBase64DataUri = canvas.toDataURL("image/png");
                        var imgBase64Content = imgBase64DataUri.substring(b64Prefix.length, imgBase64DataUri.length);
                        var myImageFile = new JSPM.PrintFile(imgBase64Content, JSPM.FileSourceType.Base64, 'myFileToPrint.png', 1);
                        //add file to print job
                        cpj.files.push(myImageFile);
                        //Send print job to printer!
                        cpj.sendToClient();
                    });
                }
                this.pos.get_order()._printed = true;
            } else {
                return this._super();
            }

        },
    })
});
