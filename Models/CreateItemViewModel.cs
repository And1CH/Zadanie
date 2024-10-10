using Microsoft.AspNetCore.Mvc.Rendering;
using System.Collections.Generic;

namespace WebApplication2.Models
{
    public class CreateItemViewModel
    {
        public Item Item { get; set; } = new Item(); 
        public string ItemType { get; set; } = string.Empty; 
        public List<SelectListItem> ItemTypes { get; set; } = new List<SelectListItem>(); S
    }
}
