# Payment Integration

- We need to add a payment support, our payment provider is Dodo Payment (https://better-auth.com/docs/plugins/dodopayments).
- Our payment works on creating a org, we have 15 days of free trial and then payment should be done. I have added this trial config in Dodo Dashboard also.
- We need to show this screen once the Org is created, we can also introduced the invoicing way where instead of directly showing payment screen after create org, we can raise the invoice which can be due in like 15 days, and if invoice is not paid by customer within that timeline, then application will be locked for that org and all the members of that org.
- For owner, there will be a page in settings where they can see the payment status, invoices, and manage those details. Invoice will be shown and if they want to pay that invoice then click on invoice and dodo hosted payment page will be opened where they can pay or setup the auto pay. If auto pay is there then we have to give customer a page or place where they can update their mandate info like credit card info if card is expired.
- When org is created, we will create a new customer in dodo and will raise a invoice for that customer, here customer name will be org name and primary contact email will be owner's email.
- Think of proper UX for this application for payments, you can also research about how other SaaS manages the payment flow and customer UX, so we can have hassle free experience for customer regarding payment.


Dodo Product
product_id: `pdt_0NrRhQONNdCc90vSRvBEo`
subscription: $5 / month

I have installed the `dodo` cli which you can use to read the config for Test Mode for Dodo.
Let me know if I need to give you any API KEY or need to setup any webhooks. Give me detailed step by step instruction and values so I can easily do that.